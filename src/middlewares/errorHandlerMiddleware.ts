import Logger from "@/utils/logger";
import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";

export const errorHandler: ErrorRequestHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): any => {
  Logger.error(`Erro Occurred on PATH: ${req.path} `, error);
  if (error instanceof SyntaxError) {
    return res.status(400).json({
      message: "Invalid JSON format. Please check your request body.",
    });
  }
  return res.status(500).json({
    message: "Internal Server Error",
    error: error?.message || "Unknown error occurred",
  });

  //   next();
};
