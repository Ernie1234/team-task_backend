import { MailtrapClient } from "mailtrap";
import Logger from "@/utils/logger";
import { config } from "@/config/app.config";

const TOKEN = config.MAILTRAP_TOKEN;

if (!TOKEN) {
  Logger.error("Mailtrap token is missing in environment variables");
}

export const mailtrapClient = new MailtrapClient({
  token: TOKEN,
});

export const sender = {
  email: "mailtrap@demomailtrap.com",
  name: "Team_Task",
};
