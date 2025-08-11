import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { config } from "./app.config";
import type { Request } from "express";
import { NotFoundException } from "@/utils/appError";
import Logger from "@/utils/logger";
import { ProviderEnum } from "@/enums/account-provider-enum";
import { loginOrCreateAccount } from "@/services/auth-service";

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
