import "dotenv/config";
import express from "express";
import { createServer } from "http";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";

import { config } from "./config/app.config";
import Logger from "./utils/logger";
import morganMiddleware from "./middlewares/morgan-middleware";
import { connectDB, disconnectDB } from "./config/db";
import { errorHandler } from "./middlewares/errorHandlerMiddleware";
import { asyncHandler } from "./middlewares/asyncHandlerMiddleware";
import { BadRequestException } from "./utils/appError";
import passport from "passport";
import "@/config/passport-config";
import apiRouter from "./routes";
import SocketService from "./config/socket.config";
import { isAuthenticated } from "./middlewares/isAuthenticatedMiddleware";
import { IMAGE_EXTENSIONS, UPLOAD_ROOT } from "./config/uploads";
import { startCalendarJobs, stopCalendarJobs } from "./services/calendar-jobs";
import { trackSession } from "./middlewares/trackSessionMiddleware";

const app = express();
const server = createServer(app);
const BASE_PATH = config.BASE_PATH;

// Initialize Socket.IO service
let socketService: SocketService;

// Notes carry whole editor documents, so allow bigger bodies than the 100 KB default
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.use(morganMiddleware);

// CORS must be before session to allow credentials
app.use(
  cors({
    origin: config.FRONTEND_ORIGIN,
    credentials: true,
  })
);

// Create session middleware to be shared with Socket.IO
export const sessionMiddleware = session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: config.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  },
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());
// Devices list (Account settings): remember which sessions are signed in
app.use(trackSession);

app.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({
      message: "Team Task API is running",
      authenticated: !!req.user,
      session: req.session ? 'present' : 'missing',
      sessionID: req.sessionID,
      user: req.user ? { id: (req.user as any)._id, name: (req.user as any).name } : null,
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
    
    // Initialize Socket.IO service with session middleware
    socketService = new SocketService(server, sessionMiddleware);
    await socketService.resetStalePresence();
    
    server.listen(config.PORT, () => {
      Logger.info(
        `✅ Server listening on port: http://localhost:${config.PORT}`
      );
      Logger.info(`🚀 Socket.IO server initialized`);
      startCalendarJobs();
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

    // 2. Close the database last, after in-flight requests have finished
    await disconnectDB();
    Logger.info("🔌 Database connection closed");

    Logger.info("✅ Shutdown complete");
    process.exit(0);
  } catch (error) {
    Logger.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("unhandledRejection", (reason) => {
  Logger.error("Unhandled promise rejection:", reason);
});

startServer();
