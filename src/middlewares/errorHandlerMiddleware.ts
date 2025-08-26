import { HTTPSTATUS } from "@/config/http.config";
import { ErrorCodeEnum } from "@/enums/errorCode.enum";
import { AppError } from "@/utils/appError";
import Logger from "@/utils/logger";
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
  Logger.error(`Error Occurred on PATH: ${req.path} `, error);
  if (error instanceof SyntaxError) {
    return res.status(HTTPSTATUS.BAD_REQUEST).json({
      message: "Invalid JSON format. Please check your request body.",
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      message: error.message,
      errorCode: error.errorCode,
    });
  }

  if (error instanceof ZodError) {
    return formatZodError(res, error);
  }

  return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
    message: "Internal Server Error",
    error: error?.message || "Unknown error occurred",
  });

  //   next();
};
