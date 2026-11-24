import * as Sentry from "@sentry/bun";
import { getRequestContext } from "@/utils/request-context";

export const sentryEnabled = Boolean(process.env.SENTRY_DSN);

const SECRET_HEADERS = ["cookie", "authorization", "set-cookie", "x-api-key"];

if (sentryEnabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE || undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        const headers = event.request.headers ?? {};
        for (const key of Object.keys(headers)) if (SECRET_HEADERS.includes(key.toLowerCase())) delete headers[key];
      }
      return event;
    },
  });
}

export const reportError = (error: unknown, extra?: Record<string, unknown>) => {
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    const ctx = getRequestContext();
    if (ctx) {
      scope.setTag("requestId", ctx.requestId);
      if (ctx.method && ctx.path) scope.setTag("route", `${ctx.method} ${ctx.path}`);
      if (ctx.userId) scope.setUser({ id: ctx.userId });
    }
    if (extra) scope.setExtras(extra);
    Sentry.captureException(error);
  });
};

export const flushErrorReports = async () => {
  if (sentryEnabled) await Sentry.close(2000);
};
