import { Router } from "express";

import {
  getAllWorkspaceNotificationsController,
  markAllNotificationsAsReadController,
  markNotificationsAsReadController,
} from "@/controllers/notification-controller";

const router = Router();

router.patch(
  "/workspace/:workspaceId/mark-all-read",
  markAllNotificationsAsReadController
);
router.patch("/mark-as-read", markNotificationsAsReadController);

router.get("/workspace/:workspaceId", getAllWorkspaceNotificationsController);

export default router;
