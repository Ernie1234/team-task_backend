import { processDueReminders, syncAllCalendars } from "@/services/calendar-service";
import Logger from "@/utils/logger";

const REMINDER_EVERY_MS = 30_000;
const SYNC_EVERY_MS = 5 * 60_000;

let reminderTimer: ReturnType<typeof setInterval> | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let running = { reminders: false, sync: false };

const guarded = (key: keyof typeof running, job: () => Promise<unknown>) => async () => {
  if (running[key]) return;
  running[key] = true;
  try {
    await job();
  } catch (error) {
    Logger.error(`Calendar ${key} job failed:`, error);
  } finally {
    running[key] = false;
  }
};

/** Reminders every 30 s; Google Calendar sync every 5 min */
export const startCalendarJobs = () => {
  if (reminderTimer) return;
  const reminders = guarded("reminders", () => processDueReminders());
  const sync = guarded("sync", () => syncAllCalendars());
  reminderTimer = setInterval(reminders, REMINDER_EVERY_MS);
  syncTimer = setInterval(sync, SYNC_EVERY_MS);
  void reminders();
  Logger.info("⏰ Calendar reminders and sync started");
};

export const stopCalendarJobs = () => {
  if (reminderTimer) clearInterval(reminderTimer);
  if (syncTimer) clearInterval(syncTimer);
  reminderTimer = syncTimer = null;
  running = { reminders: false, sync: false };
};
