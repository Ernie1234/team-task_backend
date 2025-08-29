// src/routes/task-route.ts

import { Router } from "express";
import {
  createTaskController,
  getAllTasksInProjectController,
  getTaskByIdController,
  updateTaskByIdController,
  deleteTaskByIdController,
  //   getTaskAnalyticsController,
} from "@/controllers/task-controller";

const router = Router();

router.post(
  "/workspace/:workspaceId/projects/:projectId/tasks",
  createTaskController
);

router.get(
  "/workspace/:workspaceId/projects/:projectId/tasks",
  getAllTasksInProjectController
);

router.get(
  "/workspace/:workspaceId/projects/:projectId/tasks/:taskId",
  getTaskByIdController
);

router.put(
  "/workspace/:workspaceId/projects/:projectId/tasks/:taskId",
  updateTaskByIdController
);

router.delete(
  "/workspace/:workspaceId/projects/:projectId/tasks/:taskId",
  deleteTaskByIdController
);

// router.get(
//   "/workspace/:workspaceId/projects/:projectId/tasks/analytics",
//   getTaskAnalyticsController
// );

export default router;
