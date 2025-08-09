"dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import session from "cookie-session";

import { config } from "./config/app.config";
import Logger from "./utils/logger";
import morganMiddleware from "./middlewares/morgan-middleware";
import { connectDB, disconnectDB } from "./config/db";
import { errorHandler } from "./middlewares/errorHandlerMiddleware";
import { HTTPSTATUS } from "./config/http.config";
import { asyncHandler } from "./middlewares/asyncHandlerMiddleware";
import { BadRequestException } from "./utils/appError";

const app = express();
const BASE_PATH = config.BASE_PATH;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.use(morganMiddleware);
app.use(
  session({
    name: "session",
    keys: [config.SESSION_SECRET],
    maxAge: 24 * 60 * 60 * 1000,
    secure: config.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  })
);
app.use(
  cors({
    origin: config.FRONTEND_ORIGIN,
    credentials: true,
  })
);

app.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    throw new BadRequestException("bad badf");
    // res.status(HTTPSTATUS.OK).json({
    //   message: "Hello world!",
    // });
  })
);

app.use(errorHandler);

const startServer = async () => {
  try {
    await connectDB();
    const server = app.listen(config.PORT, async () => {
      Logger.info(
        `✅ Server listening on port: http://localhost:${config.PORT}`
      );
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
