import { Router, type Request, type Response } from "express";
import { config } from "@/config/app.config";
import { escapeHtml } from "@/mails/email-layout";
import { unsubscribe, verifyUnsubscribe } from "@/services/email-service";
import Logger from "@/utils/logger";

const router = Router();

const page = (title: string, text: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2328;">
<main style="max-width:440px;margin:12vh auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
<h1 style="margin:0 0 8px;font-size:20px;">${escapeHtml(title)}</h1>
<p style="margin:0 0 20px;color:#6b7280;line-height:1.55;">${escapeHtml(text)}</p>
<a href="${escapeHtml(config.FRONTEND_ORIGIN)}" style="color:#532BF3;font-weight:600;text-decoration:none;">Open Team Task</a>
</main></body></html>`;

/**
 * Unsubscribe links in emails. Public (no sign-in) but signed per person, so a
 * link only ever changes the settings of the person it was sent to.
 * POST is the one-click unsubscribe mail apps send (RFC 8058).
 */
const handle = async (req: Request, res: Response) => {
  const valid = verifyUnsubscribe(req.query.u, req.query.k, req.query.s);
  if (!valid) {
    return res.status(400).type("html").send(page("This link doesn't work", "It may be incomplete. You can change which emails you get in Team Task under Settings → Notifications."));
  }
  try {
    await unsubscribe(valid.userId, valid.kind);
  } catch (error) {
    Logger.error("Unsubscribe failed:", error);
    return res.status(500).type("html").send(page("Something went wrong", "Please try again, or turn emails off in Team Task under Settings → Notifications."));
  }
  if (req.method === "POST") return res.status(200).end();
  return res
    .type("html")
    .send(
      valid.kind === "digest"
        ? page("You won't get the daily summary anymore", "You can turn it back on any time in Team Task under Settings → Notifications.")
        : page("You won't get email notifications anymore", "Updates still show under the bell in Team Task. You can turn emails back on under Settings → Notifications.")
    );
};

router.get("/unsubscribe", handle);
router.post("/unsubscribe", handle);

export default router;
