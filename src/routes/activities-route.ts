import { getAllWorkspaceRecentActivitiesController } from "@/controllers/recent-activities-controller";
import { Router } from "express";

const router = Router();

router.get(
  "/workspace/:workspaceId",
  getAllWorkspaceRecentActivitiesController
);

export default router;
