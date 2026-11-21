import { processDigests, processEmailQueue } from "@/services/email-service";
import Logger from "@/utils/logger";
import { trackJob } from "@/utils/metrics";
import { reportError } from "@/config/instrument";

const QUEUE_EVERY_MS = 30_000;
const DIGEST_EVERY_MS = 5 * 60_000;

let timers: ReturnType<typeof setInterval>[] = [];
const running = { queue: false, digest: false };

const guarded = (key: keyof typeof running, job: () => Promise<unknown>) => async () => {
  if (running[key]) return;
  running[key] = true;
  try {
    await trackJob(`email_${key}`, job);
  } catch (error) {
    Logger.error(`Email ${key} job failed:`, error);
    reportError(error, { job: `email_${key}` });
  } finally {
    running[key] = false;
  }
};

/** Notification emails every 30 s; daily digests checked every 5 min */
export const startEmailJobs = () => {
  if (timers.length) return;
  const queue = guarded("queue", () => processEmailQueue());
  const digest = guarded("digest", () => processDigests());
  timers = [setInterval(queue, QUEUE_EVERY_MS), setInterval(digest, DIGEST_EVERY_MS)];
  void digest();
  Logger.info("✉️  Email notifications and daily digest started");
};

export const stopEmailJobs = () => {
  timers.forEach(clearInterval);
  timers = [];
};
