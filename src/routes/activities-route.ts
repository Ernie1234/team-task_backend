import { getAllWorkspaceRecentActivitiesController } from "@/controllers/recent-activities";
import { Router } from "express";

const router = Router();

router.get(
  "/workspace/:workspaceId",
  getAllWorkspaceRecentActivitiesController
);

export default router;
