import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { config } from "@/config/app.config";

const sign = (value: string) => createHmac("sha256", `cookie:${config.BETTER_AUTH_SECRET}`).update(value).digest("base64url");

/** Sets a small HttpOnly cookie whose content can't be tampered with (HMAC-signed JSON) */
export const setSignedCookie = (res: Response, name: string, payload: unknown, options: { maxAgeMs: number; path: string }) => {
  const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
  res.cookie(name, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    maxAge: options.maxAgeMs,
    path: options.path,
  });
};

/** Reads and verifies a cookie written by setSignedCookie; null if missing or tampered with */
export const readSignedCookie = <T>(req: Request, name: string): T | null => {
  const raw = (req.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!raw) return null;
  const [value, signature] = decodeURIComponent(raw).split(".");
  if (!value || !signature) return null;
  const expected = Buffer.from(sign(value));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
};

export const clearCookie = (res: Response, name: string, path: string) => res.clearCookie(name, { path });
