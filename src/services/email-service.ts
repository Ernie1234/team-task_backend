import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import { config } from "@/config/app.config";
import { apiOrigin } from "@/config/auth";
import { getSocketService } from "@/config/socket.config";
import { TaskStatusEnum } from "@/enums/task-enum";
import { sendAppEmail } from "@/mails/emails";
import { renderEmail, renderSection, renderText, type EmailListItem } from "@/mails/email-layout";
import EventModel from "@/models/event-model";
import MemberModel from "@/models/member-model";
import NotificationModel, { NotificationTypeEnum, type NotificationType } from "@/models/notification-model";
import TaskModel from "@/models/task-model";
import UserModel, { type EmailPrefs } from "@/models/user-model";
import Logger from "@/utils/logger";
import { dateInZone, isValidTimeZone, zonedMidnight } from "@/utils/zoned-time";

/*
 * Email: notifications that are still unread a little later, event reminders
 * for people who aren't in the app, and a daily digest each morning.
 */

export const DEFAULT_EMAIL_PREFS: EmailPrefs = {
  taskAssigned: true,
  taskUpdated: false,
  eventReminder: true,
  memberJoined: false,
  digest: true,
  digestHour: 8,
  timeZone: "UTC",
};

/** Which preference controls each kind of notification (others are never emailed) */
const PREF_FOR: Partial<Record<NotificationType, keyof EmailPrefs>> = {
  [NotificationTypeEnum.TASK_ASSIGNED]: "taskAssigned",
  [NotificationTypeEnum.TASK_UPDATED]: "taskUpdated",
  [NotificationTypeEnum.EVENT_REMINDER]: "eventReminder",
  [NotificationTypeEnum.MEMBER_JOINED]: "memberJoined",
};

/** Wait this long before emailing a notification; if it's been read by then, no email */
export const EMAIL_DELAY_MS = 10 * 60_000;
const MAX_ITEMS = 8;

export const prefsOf = (user: { emailPrefs?: Partial<EmailPrefs> | null }): EmailPrefs => {
  const prefs = { ...DEFAULT_EMAIL_PREFS, ...(user.emailPrefs ?? {}) };
  if (!isValidTimeZone(prefs.timeZone)) prefs.timeZone = "UTC";
  return prefs;
};

/* ---------------------------------------------------------------- links */

type UnsubscribeKind = "digest" | "all";
const signature = (userId: string, kind: UnsubscribeKind) =>
  createHmac("sha256", `unsubscribe:${config.BETTER_AUTH_SECRET}`).update(`${userId}:${kind}`).digest("base64url");

export const unsubscribeUrl = (userId: string, kind: UnsubscribeKind) =>
  `${apiOrigin()}${config.BASE_PATH}/email/unsubscribe?u=${userId}&k=${kind}&s=${signature(userId, kind)}`;

export const verifyUnsubscribe = (userId: unknown, kind: unknown, sig: unknown): { userId: string; kind: UnsubscribeKind } | null => {
  if (typeof userId !== "string" || !mongoose.isValidObjectId(userId)) return null;
  if (kind !== "digest" && kind !== "all") return null;
  if (typeof sig !== "string") return null;
  const expected = Buffer.from(signature(userId, kind));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? { userId, kind } : null;
};

/** One-click unsubscribe from an email link */
export const unsubscribe = async (userId: string, kind: UnsubscribeKind) => {
  const off =
    kind === "digest"
      ? { "emailPrefs.digest": false }
      : // Update emails only; the daily summary has its own link
        { "emailPrefs.taskAssigned": false, "emailPrefs.taskUpdated": false, "emailPrefs.eventReminder": false, "emailPrefs.memberJoined": false };
  await UserModel.updateOne({ _id: userId }, { $set: off });
};

const appUrl = (path: string) => `${config.FRONTEND_ORIGIN.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
const settingsUrl = (workspaceId?: string | null) => appUrl(workspaceId ? `/workspace/${workspaceId}?settings=notifications` : "/");

/* ---------------------------------------------------------------- notification emails */

/** "Ada" assigned you "Fix login" → curly quotes, which read better in an inbox */
const cleanMessage = (message: string) => message.replace(/"([^"]*)"/g, "\u201c$1\u201d");

/**
 * Sends the notifications that are due: reminders right away (if the person has
 * no tab open), everything else once it has gone unread for EMAIL_DELAY_MS.
 * Several at once for the same person become one email.
 */
export const processEmailQueue = async (now = new Date()) => {
  const batch = randomUUID();
  // Claim what's due in one atomic update so a second server instance can't send it too
  const claimed = await NotificationModel.updateMany(
    {
      emailed: false,
      $or: [{ type: NotificationTypeEnum.EVENT_REMINDER }, { createdAt: { $lte: new Date(now.getTime() - EMAIL_DELAY_MS) } }],
    },
    { $set: { emailed: true, emailBatch: batch } }
  );
  if (!claimed.modifiedCount) return { emails: 0, skipped: 0 };

  const notifications = await NotificationModel.find({ emailBatch: batch }).sort({ createdAt: 1 }).lean();
  const byUser = new Map<string, typeof notifications>();
  notifications.forEach((n) => {
    const key = String(n.recipient);
    byUser.set(key, [...(byUser.get(key) ?? []), n]);
  });

  const users = await UserModel.find({ _id: { $in: [...byUser.keys()] }, isActive: { $ne: false } })
    .select("name email emailPrefs currentWorkspace")
    .lean();

  let emails = 0;
  let skipped = 0;
  for (const user of users) {
    const prefs = prefsOf(user);
    const online = getSocketService()?.isUserConnected(String(user._id)) ?? false;
    const due = (byUser.get(String(user._id)) ?? []).filter((n) => {
      const pref = PREF_FOR[n.type];
      if (!pref || !prefs[pref] || n.isRead) return false;
      // Reminders already pop up in the app when it's open
      if (n.type === NotificationTypeEnum.EVENT_REMINDER && online) return false;
      return true;
    });
    skipped += (byUser.get(String(user._id))?.length ?? 0) - due.length;
    if (!due.length || !user.email) continue;

    const items: EmailListItem[] = due.slice(0, MAX_ITEMS).map((n) => ({
      title: cleanMessage(n.message),
      meta: new Intl.DateTimeFormat("en-US", { timeZone: prefs.timeZone, hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }).format(n.createdAt),
      url: n.link ? appUrl(n.link) : undefined,
    }));
    const single = due.length === 1;
    const subject = single ? items[0]!.title : `You have ${due.length} updates in Team Task`;
    const workspaceId = String(due[0]!.workspaceId ?? user.currentWorkspace ?? "");
    const unsub = unsubscribeUrl(String(user._id), "all");
    try {
      await sendAppEmail({
        to: user.email,
        subject,
        category: "Notification",
        unsubscribeUrl: unsub,
        html: renderEmail({
          preheader: single ? "Open it in Team Task" : items.map((i) => i.title).slice(0, 2).join(" · "),
          heading: single ? "You have an update" : `${due.length} updates you haven't seen`,
          body: renderSection(single ? "Update" : "Updates", items, due.length - items.length),
          cta: { label: "Open Team Task", url: items[0]!.url ?? appUrl("/") },
          reason: "You're getting this because these updates were still unread 10 minutes after they arrived.",
          settingsUrl: settingsUrl(workspaceId),
          unsubscribeUrl: unsub,
          unsubscribeLabel: "Turn off these emails",
        }),
        text: renderText([subject, "", ...items.map((i) => `- ${i.title}${i.url ? ` (${i.url})` : ""}`), "", `Email settings: ${settingsUrl(workspaceId)}`]),
      });
      emails++;
    } catch (error) {
      Logger.error(`Notification email to ${user.email} failed:`, error);
    }
  }
  return { emails, skipped };
};

/* ---------------------------------------------------------------- daily digest */

type DigestUser = { _id: unknown; name?: string; email: string; emailPrefs?: Partial<EmailPrefs> | null; currentWorkspace?: unknown };

export const buildDigest = async (user: DigestUser, now = new Date()) => {
  const prefs = prefsOf(user);
  const tz = prefs.timeZone;
  const today = dateInZone(now, tz);
  const startOfDay = zonedMidnight(today, tz);
  const startOfTomorrow = zonedMidnight(dateInZone(new Date(startOfDay.getTime() + 36 * 3600_000), tz), tz);
  const userId = new mongoose.Types.ObjectId(String(user._id));

  const memberships = await MemberModel.find({ userId }).select("workspaceId").lean();
  const workspaceIds = memberships.map((m) => m.workspaceId);
  const open = { assignedTo: userId, workspace: { $in: workspaceIds }, status: { $ne: TaskStatusEnum.DONE } };

  const [dueToday, overdue, overdueCount, dueTodayCount, events, unread] = await Promise.all([
    TaskModel.find({ ...open, dueDate: { $gte: startOfDay, $lt: startOfTomorrow } }).sort({ dueDate: 1 }).limit(MAX_ITEMS).populate("project", "name").lean(),
    TaskModel.find({ ...open, dueDate: { $lt: startOfDay } }).sort({ dueDate: 1 }).limit(MAX_ITEMS).populate("project", "name").lean(),
    TaskModel.countDocuments({ ...open, dueDate: { $lt: startOfDay } }),
    TaskModel.countDocuments({ ...open, dueDate: { $gte: startOfDay, $lt: startOfTomorrow } }),
    EventModel.find({ user: userId, start: { $lt: startOfTomorrow }, end: { $gt: startOfDay } }).sort({ start: 1 }).limit(MAX_ITEMS).lean(),
    NotificationModel.countDocuments({ recipient: userId, isRead: false }),
  ]);

  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" });
  const taskUrl = (t: { workspace: unknown; project: unknown }) => {
    const projectId = (t.project as { _id?: unknown } | null)?._id ?? t.project;
    return appUrl(`/workspace/${t.workspace}/project/${projectId}`);
  };
  const projectName = (t: { project: unknown }) => (t.project as { name?: string } | null)?.name;

  const sections = {
    dueToday: dueToday.map<EmailListItem>((t) => ({ title: t.title, meta: projectName(t), url: taskUrl(t) })),
    overdue: overdue.map<EmailListItem>((t) => ({
      title: t.title,
      meta: [`Was due ${day.format(t.dueDate!)}`, projectName(t)].filter(Boolean).join(" · "),
      url: taskUrl(t),
      tone: "danger",
    })),
    events: events.map<EmailListItem>((e) => ({
      title: e.title,
      meta: e.allDay ? "All day" : `${time.format(e.start)} – ${time.format(e.end)}${e.location ? ` · ${e.location}` : ""}`,
      url: e.workspace ? appUrl(`/workspace/${e.workspace}/calendar?event=${e._id}`) : undefined,
    })),
  };
  const empty = !dueTodayCount && !overdueCount && !events.length && !unread;
  return { today, prefs, sections, counts: { dueToday: dueTodayCount, overdue: overdueCount, events: events.length, unread }, empty };
};

const digestSubject = ({ dueToday, overdue, events }: { dueToday: number; overdue: number; events: number }) => {
  const parts = [
    dueToday && `${dueToday} due today`,
    overdue && `${overdue} overdue`,
    events && `${events} event${events === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.length ? `Your day: ${parts.join(", ")}` : "Your day in Team Task";
};

export const sendDigest = async (user: DigestUser, digest: Awaited<ReturnType<typeof buildDigest>>) => {
  const { sections, counts, prefs } = digest;
  const first = user.name?.split(" ")[0];
  const workspaceId = user.currentWorkspace ? String(user.currentWorkspace) : null;
  const unsub = unsubscribeUrl(String(user._id), "digest");
  const subject = digestSubject(counts);
  const body = [
    renderSection("Due today", sections.dueToday, counts.dueToday - sections.dueToday.length),
    renderSection("Overdue", sections.overdue, counts.overdue - sections.overdue.length),
    renderSection("On your calendar", sections.events),
    counts.unread
      ? `<p style="margin:28px 0 0;color:#6b7280;font-size:14px;">You have ${counts.unread} unread notification${counts.unread === 1 ? "" : "s"}.</p>`
      : "",
  ].join("");
  const quiet = !body.trim();
  return sendAppEmail({
    to: user.email,
    subject,
    category: "Daily digest",
    unsubscribeUrl: unsub,
    html: renderEmail({
      preheader: quiet ? "Nothing due today." : subject.replace("Your day: ", ""),
      heading: first ? `Good morning, ${first}` : "Good morning",
      intro: quiet ? "Nothing is due today and your calendar is clear." : "Here's what's on your plate today.",
      body,
      cta: { label: "Open Team Task", url: appUrl(workspaceId ? `/workspace/${workspaceId}` : "/") },
      reason: `You're getting this daily summary at ${String(prefs.digestHour).padStart(2, "0")}:00 (${prefs.timeZone}).`,
      settingsUrl: settingsUrl(workspaceId),
      unsubscribeUrl: unsub,
      unsubscribeLabel: "Stop the daily summary",
    }),
    text: renderText([
      subject,
      "",
      sections.dueToday.length && "Due today:",
      ...sections.dueToday.map((i) => `- ${i.title}`),
      sections.overdue.length && "Overdue:",
      ...sections.overdue.map((i) => `- ${i.title} (${i.meta})`),
      sections.events.length && "On your calendar:",
      ...sections.events.map((i) => `- ${i.title} (${i.meta})`),
      counts.unread && `${counts.unread} unread notifications`,
      "",
      `Stop the daily summary: ${unsub}`,
    ]),
  });
};

/** Sends today's digest to everyone whose local digest hour has come (once per local day) */
export const processDigests = async (now = new Date()) => {
  const candidates = await UserModel.find({
    "emailPrefs.digest": { $ne: false },
    isActive: { $ne: false },
    isVerified: true,
  })
    .select("name email emailPrefs lastDigestOn currentWorkspace")
    .lean();

  let sent = 0;
  for (const user of candidates) {
    const prefs = prefsOf(user);
    const today = dateInZone(now, prefs.timeZone);
    if (user.lastDigestOn === today) continue;
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: prefs.timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
    if (hour < prefs.digestHour) continue;

    // Claim today's digest first so it can't go out twice
    const claim = await UserModel.updateOne({ _id: user._id, lastDigestOn: { $ne: today } }, { $set: { lastDigestOn: today } });
    if (!claim.modifiedCount) continue;
    try {
      const digest = await buildDigest(user as DigestUser, now);
      if (digest.empty) continue; // nothing to say today
      await sendDigest(user as DigestUser, digest);
      sent++;
    } catch (error) {
      Logger.error(`Daily digest for ${user.email} failed:`, error);
    }
  }
  return { sent };
};

/** "Send me a test": today's digest right now, even when there's nothing in it */
export const sendTestDigest = async (userId: string) => {
  const user = await UserModel.findById(userId).select("name email emailPrefs currentWorkspace").lean();
  if (!user?.email) return { sent: false };
  const digest = await buildDigest(user as DigestUser);
  return sendDigest(user as DigestUser, digest);
};
