import { betterAuth, type BetterAuthOptions } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { emailOTP } from "better-auth/plugins";
import { MongoClient } from "mongodb";
import bcrypt from "bcrypt";
import { config } from "@/config/app.config";
import { sendPasswordResetCodeEmail, sendVerificationEmail, sendWelcomeEmail } from "@/mails/emails";
import { isUserActive, provisionNewUser } from "@/services/auth-service";
import Logger from "@/utils/logger";

const DAY = 60 * 60 * 24;
const isProduction = config.NODE_ENV === "production";

export const apiOrigin = () =>
  (config.BETTER_AUTH_URL || (config.GOOGLE_CALLBACK_URL ? new URL(config.GOOGLE_CALLBACK_URL).origin : `http://localhost:${config.PORT}`)).replace(/\/$/, "");

export const AUTH_BASE_PATH = `${config.BASE_PATH}/auth`;

export const createAuthOptions = (database: BetterAuthOptions["database"]) =>
  ({
    appName: "Team Task",
    baseURL: apiOrigin(),
    basePath: AUTH_BASE_PATH,
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [config.FRONTEND_ORIGIN],
    database,

    user: {
      modelName: "users",
      fields: { emailVerified: "isVerified", image: "profilePicture" },
      additionalFields: {
        currentWorkspace: { type: "string", required: false, input: false },
      },
    },
    account: {
      modelName: "auth_accounts",
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    verification: { modelName: "auth_verifications" },

    session: {
      modelName: "auth_sessions",
      expiresIn: 30 * DAY,
      updateAge: DAY,
      cookieCache: { enabled: true, maxAge: 2 * 60 },
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      password: {
        hash: (password: string) => bcrypt.hash(password, 10),
        verify: ({ hash, password }: { hash: string; password: string }) => bcrypt.compare(password, hash),
      },
    },
    emailVerification: {
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      afterEmailVerification: async (user: { email: string; name: string }) => {
        await sendWelcomeEmail(user.email, user.name).catch((error) => Logger.warn(`Welcome email failed: ${(error as Error).message}`));
      },
    },

    socialProviders: {
      google: {
        clientId: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
      },
    },

    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: true,
        async sendVerificationOTP({ email, otp, type }) {
          if (type === "forget-password") await sendPasswordResetCodeEmail(email, otp);
          else if (type === "email-verification") await sendVerificationEmail(email, otp);
        },
      }),
    ],

    databaseHooks: {
      user: {
        create: {
          after: async (user: { id: string; name: string }) => {
            await provisionNewUser(user.id, user.name);
          },
        },
      },
      session: {
        create: {
          before: async (session: { userId: string }) => {
            if (!(await isUserActive(session.userId))) return false;
          },
        },
      },
    },

    advanced: {
      cookiePrefix: "team-task",
      defaultCookieAttributes: isProduction ? { sameSite: "none", secure: true } : { sameSite: "lax" },
    },
  }) satisfies BetterAuthOptions;

export const authMongoClient = new MongoClient(config.MONGO_URI || "mongodb://127.0.0.1:27017/team-task", {
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 5,
});

export const auth = betterAuth(createAuthOptions(mongodbAdapter(authMongoClient.db())));

export type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
