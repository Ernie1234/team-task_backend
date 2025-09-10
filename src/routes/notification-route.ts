import { Router } from "express";

import {
  markAllNotificationsAsReadController,
  markNotificationsAsReadController,
} from "@/controllers/notification-controller";

const router = Router();

router.patch(
  "/workspace/:workspaceId/mark-all-read",
  markAllNotificationsAsReadController
);

router.patch("/mark-as-read", markNotificationsAsReadController);

export default router;
