import {
  changePasswordController,
  deleteAccountController,
  getAccountController,
  getCurrentUserController,
  listSessionsController,
  revokeOtherSessionsController,
  revokeSessionController,
  updateAppearanceController,
  updateTourController,
  updateEmailPrefsController,
  sendTestDigestController,
  updateProfileController,
} from "@/controllers/user-controller";
import { Router } from "express";

const router = Router();

router.get("/current", getCurrentUserController);
router.put("/appearance", updateAppearanceController);
router.patch("/tour", updateTourController);
router.patch("/email-preferences", updateEmailPrefsController);
router.post("/email-preferences/test-digest", sendTestDigestController);
router.get("/account", getAccountController);
router.patch("/profile", updateProfileController);
router.post("/password", changePasswordController);
router.get("/sessions", listSessionsController);
router.delete("/sessions", revokeOtherSessionsController);
router.delete("/sessions/:sessionId", revokeSessionController);
router.delete("/", deleteAccountController);

export default router;
