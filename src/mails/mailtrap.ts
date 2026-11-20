import { MailtrapClient } from "mailtrap";
import Logger from "@/utils/logger";
import { config } from "@/config/app.config";

const TOKEN = config.MAILTRAP_TOKEN;

export const isMailEnabled = Boolean(TOKEN);

if (!isMailEnabled) {
  Logger.warn(
    "MAILTRAP_TOKEN is not set — emails are disabled. Verification codes and invite links will be printed to this console instead."
  );
}

export const mailtrapClient = new MailtrapClient({
  token: TOKEN,
});

export const sender = {
  email: "mailtrap@demomailtrap.com",
  name: "Team_Task",
};
