import mongoose from "mongoose";
import CalendarConnectionModel, { type CalendarConnectionDocument } from "@/models/calendar-connection-model";
import EventModel, { type EventDocument } from "@/models/event-model";
import UserModel from "@/models/user-model";
import { NotificationTypeEnum } from "@/models/notification-model";
import { notifyUsers } from "@/services/notification-service";
import { getSocketService } from "@/config/socket.config";
import { BadRequestException, NotFoundException } from "@/utils/appError";
import { decryptToken, encryptToken } from "@/utils/token-crypto";
import { dateInZone, zonedMidnight } from "@/utils/zoned-time";
import {
  deleteGoogleEvent,
  GoogleApiError,
  insertGoogleEvent,
  listGoogleEvents,
  patchGoogleEvent,
  refreshAccessToken,
  revokeToken,
  type GoogleEvent,
} from "@/utils/google-calendar";
import Logger from "@/utils/logger";
import type { CreateEventType, UpdateEventType } from "@/validation/calendar-validation";

const DAY = 86_400_000;
const SYNC_PAST_DAYS = 30;
const SYNC_FUTURE_DAYS = 180;
const MAX_PAGES = 10;

/* ------------------------------------------------------------------ helpers */

export class CalendarAuthError extends Error {}

/** When the next reminder should fire: never in the past, never for events that already started */
export const computeNextReminder = (start: Date, minutes: number | null, now = new Date()): Date | null => {
  if (minutes === null || minutes === undefined) return null;
  if (start.getTime() <= now.getTime()) return null;
  const at = start.getTime() - minutes * 60_000;
  return new Date(Math.max(at, now.getTime()));
};

/** What the client sees (no tokens, no internal fields) */
export const toClientEvent = (e: Pick<EventDocument, "_id"> & Partial<EventDocument>) => ({
  _id: String(e._id),
  title: e.title,
  description: e.description ?? "",
  location: e.location ?? "",
  start: e.start,
  end: e.end,
  allDay: !!e.allDay,
  timeZone: e.timeZone,
  reminderMinutes: e.reminderMinutes ?? null,
  source: e.source,
  syncToGoogle: !!e.syncToGoogle,
  synced: !!e.googleEventId,
  htmlLink: e.htmlLink ?? null,
  meetLink: e.meetLink ?? null,
  syncError: e.syncError ?? null,
  workspace: e.workspace ? String(e.workspace) : null,
  updatedAt: e.updatedAt,
});

const emitChanged = (userId: string) => getSocketService()?.emitToUser(userId, "calendar:changed", { userId });

export const publicConnection = (c: CalendarConnectionDocument | null) =>
  c
    ? {
        connected: true,
        provider: c.provider,
        email: c.email,
        status: c.status,
        lastError: c.lastError,
        lastSyncedAt: c.lastSyncedAt,
        timeZone: c.timeZone,
      }
    : { connected: false };

const loadConnection = (userId: string) =>
  CalendarConnectionModel.findOne({ user: userId }).select("+accessToken +refreshToken");

/** A valid access token, refreshing it when it's about to expire */
const accessTokenFor = async (connection: CalendarConnectionDocument) => {
  if (connection.expiresAt.getTime() - Date.now() > 60_000) return decryptToken(connection.accessToken);
  try {
    const fresh = await refreshAccessToken(decryptToken(connection.refreshToken));
    connection.accessToken = encryptToken(fresh.access_token);
    connection.expiresAt = new Date(Date.now() + fresh.expires_in * 1000);
    if (fresh.refresh_token) connection.refreshToken = encryptToken(fresh.refresh_token);
    connection.status = "active";
    connection.lastError = null;
    await connection.save();
    return fresh.access_token;
  } catch (error) {
    if (error instanceof GoogleApiError && (error.status === 400 || error.status === 401)) {
      connection.status = "error";
      connection.lastError = "Google access was revoked or expired. Reconnect your calendar.";
      await connection.save();
      throw new CalendarAuthError(connection.lastError);
    }
    throw error;
  }
};

/** Google event body for an event of ours */
const toGoogleBody = (e: Pick<EventDocument, "title" | "description" | "location" | "start" | "end" | "allDay" | "timeZone" | "reminderMinutes">): Partial<GoogleEvent> => ({
  summary: e.title,
  description: e.description || undefined,
  location: e.location || undefined,
  start: e.allDay ? { date: dateInZone(e.start, e.timeZone) } : { dateTime: e.start.toISOString(), timeZone: e.timeZone },
  end: e.allDay ? { date: dateInZone(e.end, e.timeZone) } : { dateTime: e.end.toISOString(), timeZone: e.timeZone },
  reminders:
    e.reminderMinutes === null
      ? { useDefault: false, overrides: [] }
      : { useDefault: false, overrides: [{ method: "popup", minutes: e.reminderMinutes }] },
});

/** Our fields from a Google event */
export const fromGoogle = (g: GoogleEvent, calendarTz: string, defaultReminder: number | null) => {
  const allDay = !!g.start?.date;
  const tz = g.start?.timeZone || calendarTz;
  const start = allDay ? zonedMidnight(g.start!.date!, calendarTz) : new Date(g.start!.dateTime!);
  const end = allDay
    ? zonedMidnight(g.end?.date ?? g.start!.date!, calendarTz)
    : new Date(g.end?.dateTime ?? g.start!.dateTime!);
  const popups = (g.reminders?.overrides ?? []).filter((r) => r.method === "popup").map((r) => r.minutes);
  const reminderMinutes = g.reminders?.useDefault ? defaultReminder : popups.length ? Math.min(...popups) : null;
  const video = g.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
  return {
    title: (g.summary || "(No title)").slice(0, 200),
    description: (g.description ?? "").slice(0, 5000),
    location: (g.location ?? "").slice(0, 300),
    start,
    end: end > start ? end : new Date(start.getTime() + (allDay ? DAY : 30 * 60_000)),
    allDay,
    timeZone: tz,
    reminderMinutes,
    htmlLink: g.htmlLink ?? null,
    meetLink: g.hangoutLink ?? video ?? null,
    googleUpdatedAt: g.updated ? new Date(g.updated) : null,
  };
};

/** Copy an event to Google (create or update). Failures are recorded on the event, not thrown. */
const pushToGoogle = async (event: EventDocument, connection: CalendarConnectionDocument | null) => {
  if (!connection || connection.status !== "active" || !event.syncToGoogle) return;
  try {
    const token = await accessTokenFor(connection);
    const body = toGoogleBody(event);
    const saved = event.googleEventId
      ? await patchGoogleEvent(token, event.googleCalendarId || connection.calendarId, event.googleEventId, body)
      : await insertGoogleEvent(token, connection.calendarId, body);
    event.googleEventId = saved.id;
    event.googleCalendarId = event.googleCalendarId || connection.calendarId;
    event.googleUpdatedAt = saved.updated ? new Date(saved.updated) : new Date();
    event.htmlLink = saved.htmlLink ?? event.htmlLink;
    event.syncError = null;
  } catch (error) {
    event.syncError = error instanceof Error ? error.message.slice(0, 300) : "Couldn't reach Google Calendar";
    Logger.warn(`Calendar push failed for event ${event._id}: ${event.syncError}`);
  }
  await event.save();
};

/* ------------------------------------------------------------------ connection */

export const getConnectionService = async (userId: string) => {
  const connection = await CalendarConnectionModel.findOne({ user: userId });
  return { connection: publicConnection(connection) };
};

export const saveConnectionService = async (
  userId: string,
  workspaceId: string | null,
  tokens: { access_token: string; expires_in: number; refresh_token?: string; scope: string },
  email: string
) => {
  const existing = await loadConnection(userId);
  const refresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : existing?.refreshToken;
  if (!refresh) throw new BadRequestException("Google didn't grant offline access. Please try connecting again.");
  if (!tokens.scope.includes("calendar")) throw new BadRequestException("Calendar access wasn't granted. Tick the calendar box when Google asks.");

  const connection = await CalendarConnectionModel.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        workspace: workspaceId,
        provider: "google",
        email,
        accessToken: encryptToken(tokens.access_token),
        refreshToken: refresh,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scope: tokens.scope,
        status: "active",
        lastError: null,
      },
    },
    { upsert: true, new: true }
  );
  return { connection };
};

export const disconnectService = async (userId: string) => {
  const connection = await loadConnection(userId);
  if (!connection) return;
  await revokeToken(decryptToken(connection.refreshToken));
  await CalendarConnectionModel.deleteOne({ _id: connection._id });
  // Imported events go; your own events stay (no longer linked to Google)
  await EventModel.deleteMany({ user: userId, source: "google" });
  await EventModel.updateMany(
    { user: userId, source: "local" },
    { $set: { googleEventId: null, googleCalendarId: null, googleUpdatedAt: null, syncToGoogle: false, syncError: null, htmlLink: null } }
  );
  emitChanged(userId);
};

/* ------------------------------------------------------------------ sync */

const syncing = new Set<string>();

/** Two-way sync with the user's Google Calendar (a window of past and upcoming events) */
export const syncGoogleCalendarService = async (userId: string) => {
  const connection = await loadConnection(userId);
  if (!connection) throw new BadRequestException("Connect a calendar first");
  if (syncing.has(userId)) return { imported: 0, updated: 0, removed: 0, skipped: true };
  syncing.add(userId);

  try {
    const token = await accessTokenFor(connection);
    const now = Date.now();
    const timeMin = new Date(now - SYNC_PAST_DAYS * DAY);
    const timeMax = new Date(now + SYNC_FUTURE_DAYS * DAY);

    // 1. Pull
    const items: GoogleEvent[] = [];
    let calendarTz = connection.timeZone || "UTC";
    let defaultReminder: number | null = null;
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await listGoogleEvents(token, connection.calendarId, {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
        ...(pageToken ? { pageToken } : {}),
      });
      if (res.timeZone) calendarTz = res.timeZone;
      const popup = res.defaultReminders?.find((r) => r.method === "popup");
      if (popup) defaultReminder = popup.minutes;
      items.push(...(res.items ?? []).filter((g) => g.status !== "cancelled" && (g.start?.date || g.start?.dateTime)));
      pageToken = res.nextPageToken;
      if (!pageToken) break;
    }

    const ids = items.map((g) => g.id);
    const existing = new Map(
      (await EventModel.find({ user: userId, googleEventId: { $in: ids } })).map((e) => [e.googleEventId!, e])
    );

    let imported = 0;
    let updated = 0;
    const fresh: Partial<EventDocument>[] = [];
    for (const g of items) {
      const fields = fromGoogle(g, calendarTz, defaultReminder);
      const mine = existing.get(g.id);
      if (!mine) {
        fresh.push({
          user: new mongoose.Types.ObjectId(userId),
          workspace: connection.workspace,
          source: "google",
          syncToGoogle: true,
          googleEventId: g.id,
          googleCalendarId: connection.calendarId,
          ...fields,
          nextReminderAt: computeNextReminder(fields.start, fields.reminderMinutes),
        });
        continue;
      }
      // Only take Google's copy when it changed there since we last saw it
      if (mine.googleUpdatedAt && fields.googleUpdatedAt && fields.googleUpdatedAt <= mine.googleUpdatedAt) continue;
      const timingChanged = mine.start.getTime() !== fields.start.getTime() || mine.reminderMinutes !== fields.reminderMinutes;
      Object.assign(mine, fields);
      if (timingChanged) mine.nextReminderAt = computeNextReminder(mine.start, mine.reminderMinutes);
      await mine.save();
      updated++;
    }
    if (fresh.length) {
      await EventModel.insertMany(fresh, { ordered: false });
      imported = fresh.length;
    }

    // 2. Deleted in Google (inside the synced window) → delete here
    const { deletedCount: removed } = await EventModel.deleteMany({
      user: userId,
      googleCalendarId: connection.calendarId,
      googleEventId: { $type: "string", $nin: ids },
      start: { $gte: timeMin, $lt: timeMax },
    });

    // 3. Push: your events that should be in Google but aren't yet (e.g. created while offline)
    const pending = await EventModel.find({ user: userId, syncToGoogle: true, googleEventId: null }).limit(50);
    for (const event of pending) await pushToGoogle(event, connection);

    connection.timeZone = calendarTz;
    connection.lastSyncedAt = new Date();
    connection.lastError = null;
    connection.status = "active";
    await connection.save();

    if (imported || updated || removed || pending.length) emitChanged(userId);
    return { imported, updated, removed };
  } catch (error) {
    if (!(error instanceof CalendarAuthError)) {
      connection.lastError = error instanceof Error ? error.message.slice(0, 300) : "Sync failed";
      await connection.save().catch(() => undefined);
    }
    throw error instanceof CalendarAuthError ? new BadRequestException(error.message) : error;
  } finally {
    syncing.delete(userId);
  }
};

/* ------------------------------------------------------------------ events */

export const listEventsService = async (userId: string, from: Date, to: Date) => {
  const events = await EventModel.find({ user: userId, start: { $lt: to }, end: { $gt: from } })
    .sort({ start: 1 })
    .limit(2000)
    .lean();
  return { events: events.map(toClientEvent) };
};

export const getEventService = async (userId: string, eventId: string) => {
  const event = await EventModel.findOne({ _id: eventId, user: userId }).lean();
  if (!event) throw new NotFoundException("Event not found");
  return { event: toClientEvent(event) };
};

const findOwnEvent = async (userId: string, eventId: string) => {
  const event = await EventModel.findOne({ _id: eventId, user: userId });
  if (!event) throw new NotFoundException("Event not found");
  return event;
};

export const createEventService = async (userId: string, data: CreateEventType) => {
  const connection = await loadConnection(userId);
  const event = await EventModel.create({
    user: userId,
    workspace: data.workspaceId ?? null,
    title: data.title,
    description: data.description ?? "",
    location: data.location ?? "",
    start: data.start,
    end: data.end,
    allDay: data.allDay ?? false,
    timeZone: data.timeZone,
    reminderMinutes: data.reminderMinutes === undefined ? 10 : data.reminderMinutes,
    nextReminderAt: computeNextReminder(data.start, data.reminderMinutes === undefined ? 10 : data.reminderMinutes),
    source: "local",
    // Default: also add it to Google when a calendar is connected
    syncToGoogle: !!connection && connection.status === "active" && data.syncToGoogle !== false,
  });
  await pushToGoogle(event, connection);
  emitChanged(userId);
  return { event: toClientEvent(event) };
};

export const updateEventService = async (userId: string, eventId: string, data: UpdateEventType) => {
  const event = await findOwnEvent(userId, eventId);
  const connection = await loadConnection(userId);

  const start = data.start ?? event.start;
  const end = data.end ?? event.end;
  if (end < start) throw new BadRequestException("The event can't end before it starts");

  const timingChanged =
    (data.start && data.start.getTime() !== event.start.getTime()) ||
    (data.reminderMinutes !== undefined && data.reminderMinutes !== event.reminderMinutes);
  const unsync = data.syncToGoogle === false && event.syncToGoogle && event.googleEventId && event.source === "local";

  const { workspaceId: _ignored, ...fields } = data;
  void _ignored;
  Object.assign(event, fields);
  if (timingChanged) event.nextReminderAt = computeNextReminder(event.start, event.reminderMinutes);
  if (event.source === "google") event.syncToGoogle = true;

  if (unsync && connection) {
    // Turned off "Add to Google Calendar": remove the Google copy
    try {
      await deleteGoogleEvent(await accessTokenFor(connection), event.googleCalendarId || connection.calendarId, event.googleEventId!);
    } catch (error) {
      Logger.warn(`Couldn't remove Google copy of ${event._id}: ${(error as Error).message}`);
    }
    event.googleEventId = null;
    event.googleCalendarId = null;
    event.htmlLink = null;
    await event.save();
  } else {
    await event.save();
    await pushToGoogle(event, connection);
  }
  emitChanged(userId);
  return { event: toClientEvent(event) };
};

export const deleteEventService = async (userId: string, eventId: string) => {
  const event = await findOwnEvent(userId, eventId);
  if (event.googleEventId) {
    const connection = await loadConnection(userId);
    if (connection?.status === "active") {
      await deleteGoogleEvent(await accessTokenFor(connection), event.googleCalendarId || connection.calendarId, event.googleEventId);
    }
  }
  await EventModel.deleteOne({ _id: event._id });
  emitChanged(userId);
  return { deletedId: eventId };
};

export const snoozeReminderService = async (userId: string, eventId: string, minutes: number) => {
  const event = await findOwnEvent(userId, eventId);
  if (event.end.getTime() <= Date.now()) throw new BadRequestException("This event has already ended");
  event.nextReminderAt = new Date(Date.now() + minutes * 60_000);
  await event.save();
  return { event: toClientEvent(event), remindAt: event.nextReminderAt };
};

/* ------------------------------------------------------------------ reminders */

const formatWhen = (e: Pick<EventDocument, "start" | "allDay" | "timeZone">, now: Date) => {
  if (e.allDay) return "today";
  const minutes = Math.round((e.start.getTime() - now.getTime()) / 60_000);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: e.timeZone }).format(e.start);
  if (minutes <= 0) return `now (${time})`;
  if (minutes < 60) return `in ${minutes} min (${time})`;
  if (minutes < 24 * 60) return `in ${Math.round(minutes / 60)} h (${time})`;
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: e.timeZone }).format(e.start);
};

/** Send every reminder that is due: a live toast over the socket + an entry in Notifications */
export const processDueReminders = async (now = new Date()) => {
  const due = await EventModel.find({ nextReminderAt: { $lte: now } }).sort({ nextReminderAt: 1 }).limit(200);
  let sent = 0;
  for (const event of due) {
    // Claim it first so a second server instance can't send it twice
    const claimed = await EventModel.updateOne({ _id: event._id, nextReminderAt: event.nextReminderAt }, { $set: { nextReminderAt: null } });
    if (!claimed.modifiedCount) continue;
    // Missed while the server was down and already over: skip quietly
    if (event.end.getTime() < now.getTime()) continue;

    const userId = String(event.user);
    const when = formatWhen(event, now);
    getSocketService()?.emitToUser(userId, "event:reminder", { event: toClientEvent(event), when });

    let workspaceId = event.workspace ? String(event.workspace) : null;
    if (!workspaceId) {
      const user = await UserModel.findById(userId).select("currentWorkspace").lean();
      workspaceId = user?.currentWorkspace ? String(user.currentWorkspace) : null;
    }
    if (workspaceId) {
      await notifyUsers([
        {
          recipient: userId,
          sender: userId,
          workspaceId,
          type: NotificationTypeEnum.EVENT_REMINDER,
          message: `${event.title} starts ${when}`,
          link: `/workspace/${workspaceId}/calendar?event=${event._id}`,
        },
      ]);
    }
    sent++;
  }
  return { sent };
};

/** Background sync for every connected calendar */
export const syncAllCalendars = async () => {
  const connections = await CalendarConnectionModel.find({ status: "active" }).select("user").lean();
  for (const c of connections) {
    try {
      await syncGoogleCalendarService(String(c.user));
    } catch (error) {
      Logger.warn(`Calendar sync failed for user ${c.user}: ${(error as Error).message}`);
    }
  }
};
