import { config } from "@/config/app.config";
import Logger from "@/utils/logger";
import { mailtrapClient, sender } from "./mailtrap";
import {
  passwordResetRequestTemplate,
  passwordResetSuccessTemplate,
  verificationEmailTemplate,
  workspaceInvitationTemplate,
} from "./email-template";

const baseUrl = config.FRONTEND_ORIGIN;

// Define recipient type
interface Recipient {
  email: string;
}

export const sendVerificationEmail = async (
  email: string,
  verificationToken: string
) => {
  const recipient: Recipient[] = [{ email }];
  const verificationLink = `${baseUrl}/verify-email?email=${email}&token=${verificationToken}`;
  try {
    const response = await mailtrapClient.send({
      from: sender,
      to: recipient,
      subject: "Verify your email",
      html: verificationEmailTemplate
        .replace("{verificationCode}", verificationToken)
        .replace("{verificationLink}", `${verificationLink}`),
      category: "Email Verification",
    });

    Logger.info("Email sent successfully", response);
  } catch (error) {
    Logger.error("Error sending verification email", error);
    throw new Error(
      `Error sending verification email: ${(error as Error).message}`
    );
  }
};

export const sendWelcomeEmail = async (
  email: string,
  name: string
): Promise<void> => {
  const recipient: Recipient[] = [{ email }];

  try {
    const response = await mailtrapClient.send({
      from: sender,
      to: recipient,
      template_uuid: config.MAILTRAP_TEMPLATE_UUID,
      template_variables: {
        company_info_name: "Team Task",
        name,
      },
    });

    Logger.info("Welcome email sent successfully", response);
  } catch (error) {
    Logger.error("Error sending welcome email", error);
    throw new Error(`Error sending welcome email: ${(error as Error).message}`);
  }
};

export const sendPasswordResetEmail = async (
  email: string,
  resetURL: string
): Promise<void> => {
  const recipient: Recipient[] = [{ email }];

  try {
    const response = await mailtrapClient.send({
      from: sender,
      to: recipient,
      subject: "Reset your password",
      html: passwordResetRequestTemplate.replace("{resetURL}", resetURL),
      category: "Password Reset",
    });

    Logger.info("Password reset email sent successfully", response);
  } catch (error) {
    Logger.error("Error sending password reset email", error);
    throw new Error(
      `Error sending password reset email: ${(error as Error).message}`
    );
  }
};

// Function to send a password reset success email
export const sendResetSuccessEmail = async (email: string): Promise<void> => {
  const recipient: Recipient[] = [{ email }];

  try {
    const response = await mailtrapClient.send({
      from: sender,
      to: recipient,
      subject: "Password Reset Successful",
      html: passwordResetSuccessTemplate,
      category: "Password Reset",
    });

    Logger.info("Password reset success email sent successfully", response);
  } catch (error) {
    Logger.error("Error sending password reset success email", error);
    throw new Error(
      `Error sending password reset success email: ${(error as Error).message}`
    );
  }
};

export const sendWorkspaceInvitationEmail = async (
  email: string,
  inviterName: string,
  workspaceName: string,
  inviteURL: string
): Promise<void> => {
  const recipient: Recipient[] = [{ email }];

  try {
    const response = await mailtrapClient.send({
      from: sender,
      to: recipient,
      subject: "You've been invited to join a Team Task workspace!",
      html: workspaceInvitationTemplate
        .replace("{inviterName}", inviterName)
        .replace("{workspaceName}", workspaceName)
        .replace("{inviteURL}", inviteURL),
      category: "Workspace Invitation",
    });

    Logger.info("Workspace invitation email sent successfully", response);
  } catch (error) {
    Logger.error("Error sending workspace invitation email", error);
    throw new Error(
      `Error sending workspace invitation email: ${(error as Error).message}`
    );
  }
};
