import mongoose from "mongoose";
import { config } from "./app.config";
import Logger from "@/utils/logger";

let isConnected = false;
let isShuttingDown = false;

export const connectDB = async () => {
  if (isConnected) {
    Logger.info("Using existing database connection");
    return;
  }

  try {
    const conn = await mongoose.connect(config.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    });

    isConnected = true;
    Logger.info(`🔗 MongoDB Connected: ${conn.connection.host}`);
    void reportLatency();
  } catch (error) {
    Logger.error("MongoDB connection error:", error);
    throw error;
  }
};

const reportLatency = async () => {
  try {
    const db = mongoose.connection.db;
    if (!db) return;
    const samples: number[] = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      await db.admin().ping();
      samples.push(performance.now() - start);
    }
    const ms = Math.round(samples.sort((a, b) => a - b)[1]!);
    if (ms > 80) {
      Logger.warn(
        `🐢 MongoDB round trip is ~${ms} ms. Each request makes several, so pages wait ${ms * 3}–${ms * 6} ms on the database. ` +
          "For development, run MongoDB locally (MONGO_URI=mongodb://127.0.0.1:27017/team-task); " +
          "for production, host the database in the same region as the API."
      );
    } else {
      Logger.info(`⚡ MongoDB round trip is ~${ms} ms`);
    }
  } catch {
    // Informational only
  }
};

export const disconnectDB = async () => {
  isShuttingDown = true;
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
  }
};

mongoose.connection.on("disconnected", () => {
  isConnected = false;
  if (isShuttingDown) return;
  Logger.info("MongoDB disconnected - attempting to reconnect...");
  setTimeout(() => {
    connectDB().catch(() => {
    });
  }, 3000);
});
