import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@/config/auth";
import { UnauthorizedException } from "@/utils/appError";
import Logger from "@/utils/logger";

/**
 * Loads the Better Auth session (from its signed cookie cache when fresh, else
 * the database) and exposes it the way the rest of the API expects:
 * `req.user._id` and friends, plus `req.authSession` for device management.
 */
export const attachSession = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (result) {
      req.user = {
        ...result.user,
        _id: new mongoose.Types.ObjectId(result.user.id),
        profilePicture: result.user.image ?? null,
        isVerified: result.user.emailVerified,
      } as unknown as Express.User;
      req.authSession = result.session;
    }
  } catch (error) {
    Logger.warn(`Couldn't read the session: ${(error as Error).message}`);
  }
  next();
};

export const isAuthenticated = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user || !req.user?._id) throw new UnauthorizedException("Unauthorized. Please login");
  next();
};
