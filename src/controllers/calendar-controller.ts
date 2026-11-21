import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { HTTPSTATUS } from "@/config/http.config";
import { config } from "@/config/app.config";
import { asyncHandler } from "@/middlewares/asyncHandlerMiddleware";
import { getMemberRoleInWorkspace } from "@/services/member-service";
import {
  createEventService,
  deleteEventService,
  disconnectService,
  getEventService,
  getConnectionService,
  listEventsService,
  saveConnectionService,
  snoozeReminderService,
  syncGoogleCalendarService,
  updateEventService,
} from "@/services/calendar-service";
import { buildGoogleAuthUrl, emailFromIdToken, exchangeCode } from "@/utils/google-calendar";
import {
  createEventSchema,
  eventIdSchema,
  listEventsQuerySchema,
  snoozeSchema,
  updateEventSchema,
} from "@/validation/calendar-validation";
import Logger from "@/utils/logger";
import { clearCookie, readSignedCookie, setSignedCookie } from "@/utils/signed-cookie";
import mongoose from "mongoose";

type PendingConnect = { state: string; userId: string; workspaceId: string | null; createdAt: number };
const STATE_COOKIE = "tt_calendar_oauth";
const STATE_PATH = `${config.BASE_PATH}/calendar`;

const userIdOf = (req: Request) => String(req.user?._id);
const OAUTH_TTL_MS = 10 * 60_000;

const calendarPage = (workspaceId: string | null, params: Record<string, string>) =>
  `${config.FRONTEND_ORIGIN}${workspaceId ? `/workspace/${workspaceId}/calendar` : "/"}?${new URLSearchParams(params)}`;

export const getConnectionController = asyncHandler(async (req: Request, res: Response) => {
  const { connection } = await getConnectionService(userIdOf(req));
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Calendar connection", connection });
});

/** Step 1: send the user to Google to allow calendar access */
export const connectGoogleController = asyncHandler(async (req: Request, res: Response) => {
  const userId = userIdOf(req);
  const raw = typeof req.query.workspaceId === "string" ? req.query.workspaceId : null;
  const workspaceId = raw && mongoose.isValidObjectId(raw) ? raw : null;
  if (workspaceId) await getMemberRoleInWorkspace(userId, workspaceId);

  const state = randomBytes(24).toString("base64url");
  // Remember this request for the callback (signed, expires with the request)
  setSignedCookie(res, STATE_COOKIE, { state, userId, workspaceId, createdAt: Date.now() } satisfies PendingConnect, { maxAgeMs: OAUTH_TTL_MS, path: STATE_PATH });
  return res.redirect(buildGoogleAuthUrl(state, (req.user as { email?: string } | undefined)?.email));
});

/** Step 2: Google sends the user back here with a one-time code */
export const googleCallbackController = asyncHandler(async (req: Request, res: Response) => {
  const pending = readSignedCookie<PendingConnect>(req, STATE_COOKIE);
  clearCookie(res, STATE_COOKIE, STATE_PATH);
  const workspaceId = pending?.workspaceId ?? null;
  const fail = (reason: string) => res.redirect(calendarPage(workspaceId, { calendar: "error", reason }));

  if (req.query.error) return fail(req.query.error === "access_denied" ? "You didn't allow calendar access" : String(req.query.error));
  if (
    !pending ||
    typeof req.query.state !== "string" ||
    req.query.state !== pending.state ||
    pending.userId !== userIdOf(req) ||
    Date.now() - pending.createdAt > OAUTH_TTL_MS
  ) {
    return fail("The connection request expired. Please try again.");
  }
  if (typeof req.query.code !== "string") return fail("Google didn't return an authorization code");

  try {
    const tokens = await exchangeCode(req.query.code);
    await saveConnectionService(pending.userId, workspaceId, tokens, emailFromIdToken(tokens.id_token));
  } catch (error) {
    Logger.error("Calendar connect failed:", error);
    return fail(error instanceof Error ? error.message : "Couldn't connect to Google Calendar");
  }

  // First sync now so events show up straight away (a failure here isn't fatal)
  try {
    await syncGoogleCalendarService(pending.userId);
  } catch (error) {
    Logger.warn(`First calendar sync failed: ${(error as Error).message}`);
  }
  return res.redirect(calendarPage(workspaceId, { calendar: "connected" }));
});

export const syncGoogleController = asyncHandler(async (req: Request, res: Response) => {
  const result = await syncGoogleCalendarService(userIdOf(req));
  const { connection } = await getConnectionService(userIdOf(req));
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Calendar synced", ...result, connection });
});

export const disconnectGoogleController = asyncHandler(async (req: Request, res: Response) => {
  await disconnectService(userIdOf(req));
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Calendar disconnected" });
});

export const listEventsController = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = listEventsQuerySchema.parse(req.query);
  const { events } = await listEventsService(userIdOf(req), from, to);
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Events", events });
});

export const getEventController = asyncHandler(async (req: Request, res: Response) => {
  const eventId = eventIdSchema.parse(req.params.eventId);
  const { event } = await getEventService(userIdOf(req), eventId);
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Event", event });
});

export const createEventController = asyncHandler(async (req: Request, res: Response) => {
  const data = createEventSchema.parse(req.body ?? {});
  if (data.workspaceId) await getMemberRoleInWorkspace(userIdOf(req), data.workspaceId);
  const { event } = await createEventService(userIdOf(req), data);
  return res.status(HTTPSTATUS.CREATED).json({ status: true, message: "Event created", event });
});

export const updateEventController = asyncHandler(async (req: Request, res: Response) => {
  const eventId = eventIdSchema.parse(req.params.eventId);
  const data = updateEventSchema.parse(req.body ?? {});
  const { event } = await updateEventService(userIdOf(req), eventId, data);
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Event updated", event });
});

export const deleteEventController = asyncHandler(async (req: Request, res: Response) => {
  const eventId = eventIdSchema.parse(req.params.eventId);
  await deleteEventService(userIdOf(req), eventId);
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Event deleted" });
});

export const snoozeController = asyncHandler(async (req: Request, res: Response) => {
  const eventId = eventIdSchema.parse(req.params.eventId);
  const { minutes } = snoozeSchema.parse(req.body ?? {});
  const result = await snoozeReminderService(userIdOf(req), eventId, minutes);
  return res.status(HTTPSTATUS.OK).json({ status: true, message: `Reminder snoozed for ${minutes} min`, ...result });
});
