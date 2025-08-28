import {
  createProjectController,
  deleteProjectByIdInWorkspaceController,
  getAllProjectsInWorkspaceController,
  getAProjectByIdInWorkspaceController,
  getProjectAnaylyticsController,
  updateProjectByIdInWorkspaceController,
} from "@/controllers/project-controller";
import { Router } from "express";

const router = Router();

router.post("/workspace/:workspaceId/create-project", createProjectController);
router.get(
  "/workspace/:workspaceId/all-projects",
  getAllProjectsInWorkspaceController
);
router.get(
  "/workspace/:workspaceId/all-projects/:id",
  getAProjectByIdInWorkspaceController
);
router.get(
  "/workspace/:workspaceId/all-projects/:id/analytics",
  getProjectAnaylyticsController
);
router.put(
  "/workspace/:workspaceId/all-projects/:id/update",
  updateProjectByIdInWorkspaceController
);
router.delete(
  "/workspace/:workspaceId/all-projects/:id/delete",
  deleteProjectByIdInWorkspaceController
);

export default router;
