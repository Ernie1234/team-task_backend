import { config } from "@/config/app.config";
import {
  googleLoginCallback,
  loginUserController,
  logoutUserController,
  registerUserController,
} from "@/controllers/auth-controller";
import { Router } from "express";
import passport from "passport";

const router = Router();

// Register Credentials Route
router.post("/register", registerUserController);
router.post("/login", loginUserController);
router.post("/logout", logoutUserController);

// Google OAuth routes
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${config.FRONTEND_GOOGLE_CALLBACK_URL}?status=failure`,
  }),
  googleLoginCallback
);

export default router;
