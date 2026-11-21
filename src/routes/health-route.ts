import { timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import mongoose from "mongoose";
import { authMongoClient } from "@/config/auth";
import { registry } from "@/utils/metrics";

const startedAt = Date.now();
let draining = false;
/** Shutdown started: report not-ready so the load balancer stops sending traffic */
export const markDraining = () => {
  draining = true;
};

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms))]);

const check = async (run: () => Promise<unknown>) => {
  const started = Date.now();
  try {
    await withTimeout(run(), 2000);
    return { status: "ok" as const, latencyMs: Date.now() - started };
  } catch (error) {
    return { status: "down" as const, latencyMs: Date.now() - started, error: (error as Error).message };
  }
};

const version = process.env.APP_VERSION || process.env.RENDER_GIT_COMMIT || process.env.FLY_IMAGE_REF || "dev";

const router = Router();

/** Liveness: the process is up and answering */
router.get("/health", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ status: "ok", service: "team-task-api", version, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), timestamp: new Date().toISOString() });
});

/** Readiness: the databases answer, so requests can be served */
router.get("/health/ready", async (_req: Request, res: Response) => {
  const [database, authDatabase] = await Promise.all([
    check(async () => {
      if (mongoose.connection.readyState !== 1) throw new Error("not connected");
      await mongoose.connection.db!.admin().ping();
    }),
    check(() => authMongoClient.db().command({ ping: 1 })),
  ]);
  const ready = !draining && database.status === "ok" && authDatabase.status === "ok";
  res.setHeader("Cache-Control", "no-store");
  res.status(ready ? 200 : 503).json({ status: ready ? "ok" : draining ? "shutting_down" : "degraded", checks: { database, authDatabase } });
});

/**
 * Prometheus metrics. Needs `Authorization: Bearer <METRICS_TOKEN>` when that's
 * set; without a token it's open in development and closed in production.
 */
router.get("/metrics", async (req: Request, res: Response) => {
  const token = process.env.METRICS_TOKEN;
  if (token) {
    const given = Buffer.from(req.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
    const expected = Buffer.from(token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return res.status(401).json({ message: "Metrics need a valid token" });
  } else if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ message: "Set METRICS_TOKEN to read metrics in production" });
  }
  res.setHeader("Content-Type", registry.contentType);
  res.send(await registry.metrics());
});

export default router;
