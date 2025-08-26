import { UnauthorizedException } from "@/utils/appError";
import type { NextFunction, Request, Response } from "express";

export const isAuthenticated = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || !req.user?._id)
    throw new UnauthorizedException("Unauthorized. Please login");
  next();
};
