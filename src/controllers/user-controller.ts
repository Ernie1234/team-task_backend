import { HTTPSTATUS } from "@/config/http.config";
import { asyncHandler } from "@/middlewares/asyncHandlerMiddleware";
import { fetchCurrentUser, updateAppearanceService } from "@/services/user-service";
import { appearanceSchema, changePasswordSchema, deleteAccountSchema, updateProfileSchema } from "@/validation/user-validation";
import {
  changePasswordService,
  deleteAccountService,
  getAccountService,
  listSessionsService,
  revokeOtherSessionsService,
  revokeSessionService,
  updateProfileService,
} from "@/services/account-service";
import type { Request, Response } from "express";

export const getCurrentUserController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const { user } = await fetchCurrentUser(userId);

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "User fetch Successfully!",
      user,
    });
  }
);

export const updateAppearanceController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = String(req.user?._id);
    const data = appearanceSchema.parse(req.body);
    const { appearance } = await updateAppearanceService(userId, data);

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Appearance saved",
      appearance,
    });
  }
);

export const getAccountController = asyncHandler(async (req: Request, res: Response) => {
  const { account } = await getAccountService(String(req.user?._id));
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Account", account });
});

export const updateProfileController = asyncHandler(async (req: Request, res: Response) => {
  const data = updateProfileSchema.parse(req.body ?? {});
  const { user } = await updateProfileService(String(req.user?._id), data);
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Profile updated", user });
});

export const changePasswordController = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body ?? {});
  await changePasswordService(String(req.user?._id), currentPassword, newPassword);
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Password saved" });
});

export const listSessionsController = asyncHandler(async (req: Request, res: Response) => {
  const { sessions } = await listSessionsService(String(req.user?._id), req.sessionID, req.sessionStore);
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Devices", sessions });
});

export const revokeSessionController = asyncHandler(async (req: Request, res: Response) => {
  await revokeSessionService(String(req.user?._id), String(req.params.sessionId), req.sessionID, req.sessionStore);
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Logged out of that device" });
});

export const revokeOtherSessionsController = asyncHandler(async (req: Request, res: Response) => {
  const { count } = await revokeOtherSessionsService(String(req.user?._id), req.sessionID, req.sessionStore);
  return res.status(HTTPSTATUS.OK).json({ status: true, message: `Logged out of ${count} other device${count === 1 ? "" : "s"}`, count });
});

export const deleteAccountController = asyncHandler(async (req: Request, res: Response) => {
  const { confirmEmail } = deleteAccountSchema.parse(req.body ?? {});
  await deleteAccountService(String(req.user?._id), confirmEmail, req.sessionStore);
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.status(HTTPSTATUS.OK).json({ status: true, message: "Account deleted" });
    });
  });
});
