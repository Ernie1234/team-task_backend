import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "@/config/app.config";

// OAuth tokens are encrypted at rest (AES-256-GCM). The key comes from
// CALENDAR_TOKEN_KEY, or is derived from SESSION_SECRET. Changing it means
// users reconnect their calendar.
const key = createHash("sha256")
  .update(process.env.CALENDAR_TOKEN_KEY || `calendar-tokens:${config.SESSION_SECRET}`)
  .digest();

export const encryptToken = (plain: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
};

export const decryptToken = (sealed: string): string => {
  const [iv, tag, data] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
};
