import { HTTPSTATUS } from "@/config/http.config";
import { Permissions } from "@/enums/role-enum";
import { asyncHandler } from "@/middlewares/asyncHandlerMiddleware";
import { getMemberRoleInWorkspace } from "@/services/member-service";
import {
  changeMemberRoleService,
  createWorkspaceService,
  getUserWorkspacesIsMemberService,
  getWorkspaceAnalyticsService,
  getWorkspaceByIdService,
  getWorkspaceMembersService,
} from "@/services/workspace-service";
import { roleGuard } from "@/utils/roleGuard";
import {
  changeRoleSchema,
  createWorkspaceSchema,
  workspaceIdSchema,
} from "@/validation/workspace-validation";
import type { Request, Response } from "express";

export const createWorkspaceController = asyncHandler(
  async (req: Request, res: Response) => {
    const body = createWorkspaceSchema.parse(req.body);
    const userId = req.user?._id;

    const { workspace } = await createWorkspaceService(userId, body);

    return res.status(HTTPSTATUS.CREATED).json({
      status: true,
      message: "Workspace created successfully!",
      workspace,
    });
  }
);

export const getAllWorkspacesUserIsMemberController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const { workspaces } = await getUserWorkspacesIsMemberService(userId);

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "User workspaces fetched successfully!",
      workspaces,
    });
  }
);
export const getWorkspaceByIdController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const workspaceId = workspaceIdSchema.parse(req.params.id);

    await getMemberRoleInWorkspace(userId, workspaceId);

    const { workspaceWithMembers } = await getWorkspaceByIdService(workspaceId);

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Workspace fetched successfully!",
      workspaceWithMembers,
    });
  }
);
export const getWorkspaceMembersController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const workspaceId = workspaceIdSchema.parse(req.params.id);

    const { role } = await getMemberRoleInWorkspace(userId, workspaceId);
    roleGuard(role, [Permissions.VIEW_ONLY]);

    const { members, roles } = await getWorkspaceMembersService(workspaceId);

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Workspace members fetched successfully!",
      members,
      roles,
    });
  }
);
export const getWorkspaceAnalyticsController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const workspaceId = workspaceIdSchema.parse(req.params.id);

    const { role } = await getMemberRoleInWorkspace(userId, workspaceId);
    roleGuard(role, [Permissions.VIEW_ONLY]);

    const { analytics } = await getWorkspaceAnalyticsService(workspaceId);

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Workspace Analytics retrieved successfully!",
      analytics,
    });
  }
);
export const changeWorkspaceMemberRoleController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const workspaceId = workspaceIdSchema.parse(req.params.id);
    const { memberId, roleId } = changeRoleSchema.parse(req.body);

    const { role } = await getMemberRoleInWorkspace(userId, workspaceId);
    roleGuard(role, [Permissions.CHANGE_MEMBER_ROLE]);

    const { member } = await changeMemberRoleService({
      workspaceId,
      memberId,
      roleId,
    });

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Workspace Analytics retrieved successfully!",
      analytics,
    });
  }
);
