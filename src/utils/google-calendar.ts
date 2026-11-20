import { config } from "@/config/app.config";

/**
 * Minimal Google Calendar + OAuth client over fetch.
 * Docs: https://developers.google.com/calendar/api/v3/reference/events
 */

export const GOOGLE_CALENDAR_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];

/** Where Google sends people back after they allow access (must be listed in the Google Cloud console) */
export const calendarCallbackUrl = () =>
  process.env.GOOGLE_CALENDAR_CALLBACK_URL ||
  `${new URL(config.GOOGLE_CALLBACK_URL).origin}${config.BASE_PATH}/calendar/google/callback`;

export class GoogleApiError extends Error {
  constructor(public status: number, message: string, public reason?: string) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;

const call = async <T>(url: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: unknown; error_description?: string };
  if (!res.ok) {
    const err = body.error as { message?: string; errors?: { reason?: string }[] } | string | undefined;
    const message = typeof err === "string" ? body.error_description || err : err?.message || res.statusText;
    const reason = typeof err === "string" ? err : err?.errors?.[0]?.reason;
    throw new GoogleApiError(res.status, message, reason);
  }
  return body as T;
};

export const buildGoogleAuthUrl = (state: string, loginHint?: string) => {
  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: calendarCallbackUrl(),
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
};

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope: string; id_token?: string };

export const exchangeCode = (code: string) =>
  call<TokenResponse>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      redirect_uri: calendarCallbackUrl(),
      grant_type: "authorization_code",
    }),
  });

export const refreshAccessToken = (refreshToken: string) =>
  call<TokenResponse>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

export const revokeToken = (token: string) =>
  call<void>(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);

/** Email from the ID token Google returned with the tokens (received directly from Google over TLS) */
export const emailFromIdToken = (idToken?: string) => {
  try {
    const payload = JSON.parse(Buffer.from(idToken!.split(".")[1]!, "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : "";
  } catch {
    return "";
  }
};

export type GoogleEventTime = { dateTime?: string; date?: string; timeZone?: string };
export type GoogleEvent = {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  updated?: string;
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] };
};
export type GoogleEventList = {
  items?: GoogleEvent[];
  nextPageToken?: string;
  timeZone?: string;
  defaultReminders?: { method: string; minutes: number }[];
};

const API = "https://www.googleapis.com/calendar/v3/calendars";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export const listGoogleEvents = (token: string, calendarId: string, params: Record<string, string>) =>
  call<GoogleEventList>(`${API}/${encodeURIComponent(calendarId)}/events?${new URLSearchParams(params)}`, { headers: auth(token) });

export const insertGoogleEvent = (token: string, calendarId: string, event: Partial<GoogleEvent>) =>
  call<GoogleEvent>(`${API}/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

export const patchGoogleEvent = (token: string, calendarId: string, eventId: string, event: Partial<GoogleEvent>) =>
  call<GoogleEvent>(`${API}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

export const deleteGoogleEvent = async (token: string, calendarId: string, eventId: string) => {
  try {
    await call<void>(`${API}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: auth(token),
    });
  } catch (error) {
    // Already gone in Google: nothing to do
    if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) return;
    throw error;
  }
};
