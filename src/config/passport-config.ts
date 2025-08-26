import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as LocalStorage } from "passport-local";
import { config } from "./app.config";
import type { Request } from "express";
import { NotFoundException } from "@/utils/appError";
import Logger from "@/utils/logger";
import { ProviderEnum } from "@/enums/account-provider-enum";
import {
  loginOrCreateAccount,
  verifyUserService,
} from "@/services/auth-service";

passport.use(
  new GoogleStrategy(
    {
      clientID: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      callbackURL: config.GOOGLE_CALLBACK_URL,
      scope: ["profile", "email"],
      passReqToCallback: true,
    },
    async (req: Request, accessToken, refreshToken, profile, done) => {
      try {
        const { email, sub: googleId, picture } = profile._json;
        Logger.info("Google Profile: ", profile);
        Logger.info("Google Id: ", googleId);

        if (!googleId) {
          throw new NotFoundException("Google Id is missing!");
        }
        const { user } = await loginOrCreateAccount({
          provider: ProviderEnum.GOOGLE,
          displayName: profile.displayName,
          providerId: googleId,
          picture: picture,
          email: email,
        });
        done(null, user);
      } catch (error) {
        done(error, false);
      }
    }
  )
);

passport.use(
  new LocalStorage(
    {
      usernameField: "email",
      passwordField: "password",
      session: true,
    },
    async (email, password, done) => {
      try {
        const user = await verifyUserService({ email, password });
        return done(null, user);
      } catch (error: any) {
        return done(error, false, { message: error?.message });
      }
    }
  )
);

passport.serializeUser((user: any, done) => done(null, user));
passport.deserializeUser((user: any, done) => done(null, user));
