import { Router } from "express";

import {
  changeWorkspaceMemberRoleController,
  createWorkspaceController,
  deleteWorkspaceByIdController,
  getAllWorkspacesUserIsMemberController,
  getWorkspaceAnalyticsController,
  getWorkspaceByIdController,
  getWorkspaceMembersController,
  inviteMemberByEmailController,
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
router.delete("/delete/:id", deleteWorkspaceByIdController);
router.post("/invite/member/:id", inviteMemberByEmailController);

export default router;
