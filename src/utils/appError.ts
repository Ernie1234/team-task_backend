import type { httpStatusCodeType } from "@/config/http.config";

export class AppError extends Error {
  public statusCode: httpStatusCodeType;
  public errorCode?:
}
