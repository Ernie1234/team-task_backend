import {
  changeWorkspaceMemberRoleController,
  createWorkspaceController,
  getAllWorkspacesUserIsMemberController,
  getWorkspaceAnalyticsController,
  getWorkspaceByIdController,
  getWorkspaceMembersController,
} from "@/controllers/workspace-controller";
import { Router } from "express";

const router = Router();

router.post("/create/new", createWorkspaceController);
router.get("/all", getAllWorkspacesUserIsMemberController);
router.get("/:id", getWorkspaceByIdController);
router.get("/members/:id", getWorkspaceMembersController);
router.get("/analytics/:id", getWorkspaceAnalyticsController);
router.put("/change/member/role/:id", changeWorkspaceMemberRoleController);

export default router;
