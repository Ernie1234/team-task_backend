import type { NextFunction, Request, Response } from "express";
import UserSessionModel from "@/models/user-session-model";
import Logger from "@/utils/logger";

// Record "last active" at most every 5 minutes per session
const WRITE_EVERY_MS = 5 * 60_000;
const lastWrite = new Map<string, number>();

/** Keeps the Devices list current: one record per signed-in session */
export const trackSession = (req: Request, _res: Response, next: NextFunction) => {
  const userId = (req.user as { _id?: unknown } | undefined)?._id;
  const sid = req.sessionID;
  if (userId && sid && Date.now() - (lastWrite.get(sid) ?? 0) > WRITE_EVERY_MS) {
    lastWrite.set(sid, Date.now());
    if (lastWrite.size > 10_000) lastWrite.clear();
    UserSessionModel.updateOne(
      { sessionId: sid },
      {
        $set: { user: userId, lastActiveAt: new Date(), userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300), ip: req.ip ?? "" },
      },
      { upsert: true }
    ).catch((error) => Logger.warn(`Couldn't record session: ${(error as Error).message}`));
  }
  next();
};

export const forgetTrackedSession = (sid: string) => lastWrite.delete(sid);
