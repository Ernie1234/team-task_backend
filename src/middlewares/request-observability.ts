import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import Logger from "@/utils/logger";
import { recordHttp } from "@/utils/metrics";
import { getRequestContext, requestContext, type RequestContext } from "@/utils/request-context";

/** Probes would drown out real traffic in the logs */
const QUIET_PATHS = new Set(["/health", "/health/ready", "/metrics", "/favicon.ico"]);
const VALID_ID = /^[\w.-]{8,128}$/;

/** The route pattern ("/api/v1/tasks/:taskId"), so metrics don't get one series per id */
const routeOf = (req: Request, status: number) => {
  if (req.route?.path) return `${req.baseUrl}${typeof req.route.path === "string" ? req.route.path : ""}`;
  if (req.baseUrl) return req.baseUrl;
  return status === 404 ? "unmatched" : "other";
};

/**
 * Gives every request an id (kept from X-Request-Id if a proxy set one, and
 * returned in the response), makes it available to every log line and error
 * report, then logs and measures the request when it finishes.
 */
export const requestObservability = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.get("x-request-id");
  const requestId = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Request-Id", requestId);

  const context: RequestContext = { requestId, method: req.method, path: req.path };
  const started = process.hrtime.bigint();

  res.on("finish", () => {
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    const route = routeOf(req, res.statusCode);
    recordHttp(req.method, route, res.statusCode, seconds);
    if (QUIET_PATHS.has(req.path)) return;
    requestContext.run(context, () =>
      Logger.log(res.statusCode >= 500 ? "error" : "info", `${req.method} ${req.originalUrl.split("?")[0]} ${res.statusCode} ${(seconds * 1000).toFixed(0)}ms`, {
        method: req.method,
        route,
        status: res.statusCode,
        durationMs: Math.round(seconds * 1000),
        ...(res.getHeader("content-length") ? { bytes: Number(res.getHeader("content-length")) } : {}),
      })
    );
  });

  requestContext.run(context, next);
};

/** After sign-in is known: add the user to this request's log lines and error reports */
export const bindUserToRequest = (req: Request, _res: Response, next: NextFunction) => {
  const context = getRequestContext();
  if (context && req.user?._id) context.userId = String(req.user._id);
  next();
};
