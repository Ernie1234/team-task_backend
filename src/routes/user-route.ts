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
  updateProfileController,
} from "@/controllers/user-controller";
import { Router } from "express";

const router = Router();

router.get("/current", getCurrentUserController);
router.put("/appearance", updateAppearanceController);
router.patch("/tour", updateTourController);
router.get("/account", getAccountController);
router.patch("/profile", updateProfileController);
router.post("/password", changePasswordController);
router.get("/sessions", listSessionsController);
router.delete("/sessions", revokeOtherSessionsController);
router.delete("/sessions/:sessionId", revokeSessionController);
router.delete("/", deleteAccountController);

export default router;
