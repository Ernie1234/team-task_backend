import { Router } from "express";

import {
  changeWorkspaceMemberRoleController,
  createWorkspaceController,
  deleteWorkspaceByIdController,
  getAllWorkspacesUserIsMemberController,
  getWorkspaceAnalyticsController,
  getWorkspaceByIdController,
  getWorkspaceMembersController,
  updateWorkspaceByIdController,
} from "@/controllers/workspace-controller";

const router = Router();

router.post("/create/new", createWorkspaceController);
router.get("/all", getAllWorkspacesUserIsMemberController);
router.get("/:id", getWorkspaceByIdController);
router.get("/members/:id", getWorkspaceMembersController);
router.get("/analytics/:id", getWorkspaceAnalyticsController);
router.put("/change/member/role/:id", changeWorkspaceMemberRoleController);
router.put("/update/:id", updateWorkspaceByIdController);
router.put("/delete/:id", deleteWorkspaceByIdController);

export default router;
