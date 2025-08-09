import mongoose from "mongoose";
import { config } from "./app.config";
import Logger from "@/utils/logger";

let isConnected = false;

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
  } catch (error) {
    Logger.error("MongoDB connection error:", error);
    throw error;
  }
};

export const disconnectDB = async () => {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    Logger.info("MongoDB disconnected");
  }
};

// Optional: Auto-reconnect on connection loss
mongoose.connection.on("disconnected", () => {
  isConnected = false;
  Logger.info("MongoDB disconnected - attempting to reconnect...");
  setTimeout(connectDB, 3000);
});
