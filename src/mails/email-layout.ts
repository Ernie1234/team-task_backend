/*
 * One layout for the app's own emails (notifications, digest). Table-based and
 * inline-styled so it renders the same in Gmail, Outlook and Apple Mail.
 */

const BRAND = "#532BF3"; // the app's primary colour
const TEXT = "#1f2328";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export type EmailListItem = { title: string; meta?: string; url?: string; tone?: "danger" | "default" };

/** A titled group of rows (tasks, events, updates) */
export const renderSection = (heading: string, items: EmailListItem[], more = 0) => {
  if (!items.length) return "";
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 0;border-top:1px solid ${BORDER};">
          ${
            item.url
              ? `<a href="${escapeHtml(item.url)}" style="color:${TEXT};text-decoration:none;font-weight:600;">${escapeHtml(item.title)}</a>`
              : `<span style="color:${TEXT};font-weight:600;">${escapeHtml(item.title)}</span>`
          }
          ${item.meta ? `<div style="color:${item.tone === "danger" ? "#dc2626" : MUTED};font-size:13px;margin-top:2px;">${escapeHtml(item.meta)}</div>` : ""}
        </td>
      </tr>`
    )
    .join("");
  return `
    <h2 style="margin:28px 0 4px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};font-weight:600;">${escapeHtml(heading)}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
    ${more > 0 ? `<p style="margin:8px 0 0;color:${MUTED};font-size:13px;">and ${more} more</p>` : ""}`;
};

export const renderEmail = ({
  preheader,
  heading,
  intro,
  body,
  cta,
  reason,
  settingsUrl,
  unsubscribeUrl,
  unsubscribeLabel = "Unsubscribe",
}: {
  /** Preview line shown next to the subject in the inbox */
  preheader: string;
  heading: string;
  intro?: string;
  /** Pre-rendered HTML (renderSection output) */
  body: string;
  cta?: { label: string; url: string };
  /** Why this person got the email */
  reason: string;
  settingsUrl: string;
  unsubscribeUrl?: string;
  unsubscribeLabel?: string;
}) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding:0 4px 16px;font-size:15px;font-weight:700;color:${TEXT};">
        <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${BRAND};margin-right:8px;"></span>Team Task
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;padding:32px;color:${TEXT};font-size:15px;line-height:1.55;">
        <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;">${escapeHtml(heading)}</h1>
        ${intro ? `<p style="margin:0;color:${MUTED};">${escapeHtml(intro)}</p>` : ""}
        ${body}
        ${
          cta
            ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td style="border-radius:8px;background:${BRAND};">
                <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:11px 20px;color:#ffffff;font-weight:600;text-decoration:none;font-size:14px;">${escapeHtml(cta.label)}</a>
              </td></tr></table>`
            : ""
        }
      </td></tr>
      <tr><td style="padding:16px 4px 0;color:${MUTED};font-size:12px;line-height:1.5;">
        ${escapeHtml(reason)}<br>
        <a href="${escapeHtml(settingsUrl)}" style="color:${MUTED};">Email settings</a>
        ${unsubscribeUrl ? ` · <a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED};">${escapeHtml(unsubscribeLabel)}</a>` : ""}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

/** Plain-text version for clients that don't show HTML */
export const renderText = (lines: (string | number | false | null | undefined)[]) => lines.filter((line) => line !== false && line !== null && line !== undefined && line !== 0).join("\n");
