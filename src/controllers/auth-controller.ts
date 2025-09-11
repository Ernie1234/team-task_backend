import type { NextFunction, Request, Response } from "express";

import { config } from "@/config/app.config";
import { asyncHandler } from "@/middlewares/asyncHandlerMiddleware";
import { registerUserSchema } from "@/validation/auth-validation";
import { HTTPSTATUS } from "@/config/http.config";
import {
  registerUserService,
  verifyEmailService,
} from "@/services/auth-service";
import passport from "passport";
import Logger from "@/utils/logger";

export const googleLoginCallback = asyncHandler(
  async (req: Request, res: Response) => {
    const currentWorkspace = req.user?.currentWorkspace;

    if (!currentWorkspace) {
      return res.redirect(
        `${config.FRONTEND_GOOGLE_CALLBACK_URL}?status=failure`
      );
    }
    return res.redirect(
      `${config.FRONTEND_ORIGIN}/workspace/${currentWorkspace}`
    );
  }
);

export const registerUserController = asyncHandler(
  async (req: Request, res: Response) => {
    const validationResult = registerUserSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(HTTPSTATUS.BAD_REQUEST).json({
        status: false,
        message: "Validation failed.",
        errors: validationResult.error.issues,
        error: validationResult.error.message,
      });
    }

    // Pass the validated data to the service
    await registerUserService(validationResult.data);
    return res
      .status(HTTPSTATUS.CREATED)
      .json({ message: "User created successfully" });
  }
);

export const loginUserController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(
      "local",
      (
        err: Error | null,
        user: Express.User | false,
        info: { message: string } | undefined
      ) => {
        if (err) return next(err);
        if (!user) {
          return res.status(HTTPSTATUS.UNAUTHORIZED).json({
            status: false,
            message: info?.message || "Invalid email or password",
          });
        }

        req.logIn(user, (err) => {
          if (err) return next(err);

          Logger.info("Logged in user successful: ", user);
          return res.status(HTTPSTATUS.OK).json({
            status: true,
            message: "Logged in successfully!",
            data: user,
          });
        });
      }
    )(req, res, next);
  }
);

export const logoutUserController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    // 1. First, call req.logout to clear the passport session.
    req.logout((err) => {
      // If there's an error from passport, pass it to the error handler.
      if (err) {
        Logger.error("Logout Error: ", err);
        return next(err); // Pass the error to the next error middleware
        //  return res
        //    .status(HTTPSTATUS.INTERNAL_SERVER_ERROR)
        //    .json({ status: false, message: "Failed to log out" });
      }

      // 2. Then, destroy the entire session from the store.
      req.session.destroy((err) => {
        // If there's an error destroying the session, handle it.
        if (err) {
          Logger.error("Session Destruction Error: ", err);
          return res
            .status(HTTPSTATUS.INTERNAL_SERVER_ERROR)
            .json({ status: false, message: "Failed to log out" });
        }

        // 3. Finally, send the success response.
        return res
          .status(HTTPSTATUS.OK)
          .json({ status: true, message: "Logged out successfully!" });
      });
    });
  }
);

export const verifyEmailController = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, token } = req.body;
    await verifyEmailService({ email, token });
    res.status(HTTPSTATUS.OK).json({ message: "Email verified successfully." });
  }
);
