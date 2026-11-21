import { HTTPSTATUS } from "@/config/http.config";
import { ErrorCodeEnum } from "@/enums/errorCode.enum";
import { AppError } from "@/utils/appError";
import Logger from "@/utils/logger";
import { reportError } from "@/config/instrument";
import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";
import { z, ZodError } from "zod";

const formatZodError = (res: Response, error: z.ZodError) => {
  const errors = error?.issues.map((err) => ({
    field: err.path.join("."),
    message: err.message,
  }));
  return res.status(HTTPSTATUS.BAD_REQUEST).json({
    message: error.message,
    errors: errors,
    errorCode: ErrorCodeEnum.VALIDATION_ERROR,
  });
};

export const errorHandler: ErrorRequestHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): any => {
  if (error instanceof SyntaxError) {
    return res.status(HTTPSTATUS.BAD_REQUEST).json({
      message: "Invalid JSON format. Please check your request body.",
    });
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      Logger.error(`${req.method} ${req.path} failed:`, error);
      reportError(error);
    }
    return res.status(error.statusCode).json({
      message: error.message,
      errorCode: error.errorCode,
    });
  }

  if (error instanceof ZodError) {
    return formatZodError(res, error);
  }

  // Unexpected: log it, send it to Sentry, and don't show internals to the caller
  Logger.error(`${req.method} ${req.path} failed:`, error);
  reportError(error);
  return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
    message: "Something went wrong on our side. Please try again.",
    errorCode: "INTERNAL_SERVER_ERROR",
    ...(process.env.NODE_ENV === "development" ? { error: error?.message } : {}),
  });

  //   next();
};
