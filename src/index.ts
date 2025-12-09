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

const app = express();
const server = createServer(app);
const BASE_PATH = config.BASE_PATH;

// Initialize Socket.IO service
let socketService: SocketService;

app.use(express.json());
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
app.use(`${BASE_PATH}`, apiRouter);

app.use(errorHandler);

const startServer = async () => {
  try {
    await connectDB();
    
    // Initialize Socket.IO service with session middleware
    socketService = new SocketService(server, sessionMiddleware);
    
    server.listen(config.PORT, () => {
      Logger.info(
        `✅ Server listening on port: http://localhost:${config.PORT}`
      );
      Logger.info(`🚀 Socket.IO server initialized`);
    });

    const shutdown = async () => {
      Logger.info("🛑 Shutting down server...");

      server.close(async () => {
        await disconnectDB();
        Logger.info("🔌 Database connection closed");
        process.exit(0);
      });

      // Force close if hanging
      setTimeout(() => {
        Logger.error("⚠️ Forcing shutdown...");
        process.exit(1);
      }, 5000);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (err) {
    Logger.error("❌ Failed to start server:", err);
    await disconnectDB();
    process.exit(1);
  }
};

startServer();
