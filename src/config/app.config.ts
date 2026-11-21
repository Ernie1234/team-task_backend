import { getEnv } from "@/utils/get-env";

const appConfig = () => ({
  NODE_ENV: getEnv("NODE_ENV", "development"),
  PORT: getEnv("PORT", "5000"),
  BASE_PATH: getEnv("BASE_PATH", "/api/v1"),
  MONGO_URI: getEnv("MONGO_URI", ""),
  MAILTRAP_TOKEN: getEnv("MAILTRAP_TOKEN"),
  MAILTRAP_TEMPLATE_UUID: getEnv("MAILTRAP_TEMPLATE_UUID"),
  SESSION_SECRET: getEnv("SESSION_SECRET"),
  SESSION_EXPIRES_IN: getEnv("SESSION_EXPIRES_IN", "30d"),
  GOOGLE_CLIENT_ID: getEnv("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: getEnv("GOOGLE_CLIENT_SECRET"),
  GOOGLE_CALLBACK_URL: getEnv("GOOGLE_CALLBACK_URL"),
  FRONTEND_ORIGIN: getEnv("FRONTEND_ORIGIN", "localhost"),
  FRONTEND_GOOGLE_CALLBACK_URL: getEnv("FRONTEND_GOOGLE_CALLBACK_URL", ""),
  // Better Auth: signs sessions/cookies. Falls back to SESSION_SECRET so existing setups keep working.
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || getEnv("SESSION_SECRET"),
  // Public URL of this API (where /api/v1/auth lives); defaults to the origin of GOOGLE_CALLBACK_URL
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "",
});

export const config = appConfig();
