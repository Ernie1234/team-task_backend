import winston from "winston";
import chalk from "chalk";
import { getRequestContext } from "@/utils/request-context";

/*
 * Logs as one JSON object per line in production (for Loki, Datadog,
 * CloudWatch…) and as coloured text in development. Lines written while
 * handling a request carry its requestId and userId automatically.
 *
 *   Logger.info("Task created", { taskId })      // fields go into the JSON
 *   Logger.error("Saving failed:", error)        // errors become { err: { message, stack } }
 */

const levels = { error: 0, warn: 1, info: 2, http: 3, debug: 4 };

const env = process.env.NODE_ENV || "development";
const isDevelopment = env === "development";
const json = process.env.LOG_FORMAT ? process.env.LOG_FORMAT === "json" : !isDevelopment;
const level = process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info");

const SPLAT = Symbol.for("splat");

const serializeError = (error: Error) => ({
  name: error.name,
  message: error.message,
  stack: error.stack,
  ...((error as { code?: unknown }).code !== undefined ? { code: (error as { code?: unknown }).code } : {}),
});

/** Errors passed as extra arguments become `err`; plain objects become fields; request context is added */
const enrich = winston.format((info) => {
  const extras = ((info as unknown as Record<symbol, unknown[]>)[SPLAT] ?? []) as unknown[];
  for (const extra of extras) {
    if (extra instanceof Error) info.err = serializeError(extra);
    else if (extra && typeof extra === "object") Object.assign(info, extra);
    else if (extra !== undefined) info.detail = extra;
  }
  if (info.message instanceof Error) {
    info.err = serializeError(info.message);
    info.message = info.message.message;
  }
  // winston copies an error's stack onto the line itself; it's already under err
  if (info.err) delete info.stack;
  const ctx = getRequestContext();
  if (ctx) {
    info.requestId ??= ctx.requestId;
    if (ctx.userId) info.userId ??= ctx.userId;
  }
  return info;
});

const colors: Record<string, (text: string) => string> = {
  error: chalk.hex("#FF6961"),
  warn: chalk.hex("#FDFD96"),
  info: chalk.hex("#77DD77"),
  http: chalk.hex("#84B6F4"),
  debug: chalk.hex("#CBC3E3"),
};

const HIDDEN = new Set(["level", "message", "timestamp", "err", "requestId"]);

const pretty = winston.format.printf((info) => {
  const fields = Object.entries(info)
    .filter(([key]) => !HIDDEN.has(key))
    .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" ");
  const id = info.requestId ? chalk.dim(` [${String(info.requestId).slice(0, 8)}]`) : "";
  const line = `${info.timestamp} ${info.level}${id}: ${info.message}${fields ? chalk.dim(` ${fields}`) : ""}`;
  const err = info.err as { stack?: string; message?: string } | undefined;
  const colour = colors[info.level] ?? ((t: string) => t);
  return colour(line) + (err ? `\n${chalk.dim(err.stack ?? err.message ?? "")}` : "");
});

const format = json
  ? winston.format.combine(enrich(), winston.format.timestamp(), winston.format.json())
  : winston.format.combine(enrich(), winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }), pretty);

const transports: winston.transport[] = [new winston.transports.Console()];
// Log files are handy on a laptop; in production stdout is collected by the platform
if (isDevelopment || process.env.LOG_FILES === "true") {
  const fileFormat = winston.format.combine(enrich(), winston.format.timestamp(), winston.format.json());
  transports.push(
    new winston.transports.File({ filename: "logs/error.log", level: "error", format: fileFormat }),
    new winston.transports.File({ filename: "logs/all.log", format: fileFormat })
  );
}

const Logger = winston.createLogger({
  level,
  levels,
  format,
  defaultMeta: json ? { service: "team-task-api", env } : undefined,
  transports,
});

export default Logger;
