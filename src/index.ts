import "dotenv/config";
// Error tracking first, so it sees everything that follows
import { flushErrorReports, reportError } from "./config/instrument";
import express from "express";
import { createServer } from "http";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";

import { config } from "./config/app.config";
import Logger from "./utils/logger";
import { bindUserToRequest, requestObservability } from "./middlewares/request-observability";
import healthRoute, { markDraining } from "./routes/health-route";
import { connectDB, disconnectDB } from "./config/db";
import { flushNoteSessions } from "./services/note-collab-service";
import { errorHandler } from "./middlewares/errorHandlerMiddleware";
import { asyncHandler } from "./middlewares/asyncHandlerMiddleware";
import { BadRequestException } from "./utils/appError";
import { auth, AUTH_BASE_PATH, authMongoClient } from "./config/auth";
import { migrateLegacyAuth } from "./services/auth-service";
import apiRouter from "./routes";
import SocketService from "./config/socket.config";
import { attachSession, isAuthenticated } from "./middlewares/isAuthenticatedMiddleware";
import { IMAGE_EXTENSIONS, UPLOAD_ROOT } from "./config/uploads";
import { startCalendarJobs, stopCalendarJobs } from "./services/calendar-jobs";
import { startEmailJobs, stopEmailJobs } from "./services/email-jobs";

const app = express();
const server = createServer(app);
const BASE_PATH = config.BASE_PATH;

// Initialize Socket.IO service
let socketService: SocketService;

// Request id, request log line and metrics for every request
app.use(requestObservability);
// /health, /health/ready and /metrics (before CORS and sessions: probes don't need them)
app.use(healthRoute);
app.use(helmet());
// CORS first, so the web app (another origin) can send cookies
app.use(
  cors({
    origin: config.FRONTEND_ORIGIN,
    credentials: true,
    // The web app shows this as an error reference
    exposedHeaders: ["X-Request-Id"],
  })
);

// Better Auth: sign-up, sign-in (email + Google), email codes, sessions.
// Mounted before express.json() because it reads the raw request body itself.
app.all(`${AUTH_BASE_PATH}/{*any}`, toNodeHandler(auth));

// Notes carry whole editor documents, so allow bigger bodies than the 100 KB default
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Who is calling: sets req.user / req.authSession from the Better Auth session cookie
app.use(attachSession);
app.use(bindUserToRequest);

app.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({
      message: "Team Task API is running",
      authenticated: !!req.user,
    });
  })
);
// Chat attachments. Only signed-in users can fetch them; the app on another
// port loads images from here, so allow cross-origin embedding.
app.use(
  "/uploads",
  isAuthenticated,
  (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(UPLOAD_ROOT, {
    index: false,
    dotfiles: "deny",
    setHeaders: (res, filePath) => {
      res.setHeader("Cache-Control", "private, max-age=86400");
      // Only images are shown inline; everything else downloads
      if (!IMAGE_EXTENSIONS.test(filePath)) {
        res.setHeader("Content-Disposition", "attachment");
      }
    },
  })
);

app.use(`${BASE_PATH}`, apiRouter);

app.use(errorHandler);

const startServer = async () => {
  try {
    await connectDB();
    await authMongoClient.connect();
    // Logins created before Better Auth keep working (adds only what's missing)
    await migrateLegacyAuth().catch((error) => Logger.error("Couldn't move existing logins to Better Auth:", error));
    
    // Initialize Socket.IO service with session middleware
    socketService = new SocketService(server);
    await socketService.resetStalePresence();
    
    server.listen(config.PORT, () => {
      Logger.info(
        `✅ Server listening on port: http://localhost:${config.PORT}`
      );
      Logger.info(`🚀 Socket.IO server initialized`);
      startCalendarJobs();
      startEmailJobs();
    });

    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
  } catch (err) {
    Logger.error("❌ Failed to start server:", err);
    await disconnectDB();
    process.exit(1);
  }
};

let isShuttingDown = false;
const SHUTDOWN_TIMEOUT_MS = 10_000;

const shutdown = async (signal: string) => {
  if (isShuttingDown) {
    // Second Ctrl+C: stop waiting
    Logger.warn(`⚠️ Received ${signal} again, exiting immediately`);
    process.exit(1);
  }
  isShuttingDown = true;
  markDraining();
  Logger.info(`🛑 ${signal} received, shutting down gracefully...`);

  // Last resort if something hangs (unref so it never keeps the process alive)
  const forceExit = setTimeout(() => {
    Logger.error(`⚠️ Shutdown took longer than ${SHUTDOWN_TIMEOUT_MS / 1000}s, forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    // 0. No new reminders or calendar syncs while shutting down
    stopCalendarJobs();
    stopEmailJobs();

    // 1. Stop accepting connections, mark users offline, disconnect sockets.
    //    (Socket.IO's close also closes the HTTP server.)
    const httpClosed = socketService
      ? socketService.close()
      : new Promise<void>((resolve) => server.close(() => resolve()));

    // Idle keep-alive connections would otherwise hold server.close() open
    server.closeIdleConnections?.();
    // Give in-flight requests a moment, then drop whatever is left
    const dropConnections = setTimeout(() => server.closeAllConnections?.(), 3000);
    dropConnections.unref();

    await httpClosed;
    Logger.info("🔒 HTTP and Socket.IO server closed");

    // Write any live-edited notes that haven't been saved yet
    await flushNoteSessions();

    // 2. Close the databases last, after in-flight requests have finished
    await Promise.all([disconnectDB(), authMongoClient.close()]);
    Logger.info("🔌 Database connection closed");

    await flushErrorReports();
    Logger.info("✅ Shutdown complete");
    process.exit(0);
  } catch (error) {
    Logger.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("unhandledRejection", (reason) => {
  Logger.error("Unhandled promise rejection:", reason);
  reportError(reason);
});

startServer();
