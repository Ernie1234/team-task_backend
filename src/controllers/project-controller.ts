import type { Request, Response } from "express";

import { asyncHandler } from "@/middlewares/asyncHandlerMiddleware";
import { HTTPSTATUS } from "@/config/http.config";
import {
  createProjectSchema,
  projectIdSchema,
  updateProjectSchema,
} from "@/validation/project-validation";
import { workspaceIdSchema } from "@/validation/workspace-validation";
import { getMemberRoleInWorkspace } from "@/services/member-service";
import { roleGuard } from "@/utils/roleGuard";
import { Permissions } from "@/enums/role-enum";
import {
  createProjectService,
  deleteProjectService,
  getProjectAnalyticsWorkspaceService,
  getProjectByIdInWorkspaceService,
  getProjectsInWorkspaceService,
  updateProjectService,
} from "@/services/project-service";

export const createProjectController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const combinedData = {
      ...req.body,
      createdBy: userId,
      workspace: req.params.workspaceId,
    };

    const validatedData = createProjectSchema.parse(combinedData);

    const { role } = await getMemberRoleInWorkspace(
      userId,
      validatedData.workspace
    );
    roleGuard(role, [Permissions.CREATE_PROJECT]);

    const { project } = await createProjectService(validatedData);

    return res.status(HTTPSTATUS.CREATED).json({
      status: true,
      message: "Project created successfully!",
      project,
    });
  }
);
export const getAllProjectsInWorkspaceController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const workspaceId = workspaceIdSchema.parse(req.params.workspaceId);

    const { role } = await getMemberRoleInWorkspace(userId, workspaceId);
    roleGuard(role, [Permissions.VIEW_ONLY]);

    const pageSize: number = parseInt(req.query.pageSize as string) || 10;
    const pageNumber: number = parseInt(req.query.pagesNumber as string) || 1;

    const { projects, totalCount, totalPages, skip } =
      await getProjectsInWorkspaceService({
        workspaceId,
        pageNumber,
        pageSize,
      });

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Project fetched successfully!",
      data: {
        projects,
        totalCount,
        pageSize,
        totalPages,
        skip,
        limit: pageSize,
      },
    });
  }
);
export const getAProjectByIdInWorkspaceController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const workspaceId = workspaceIdSchema.parse(req.params.workspaceId);
    const projectId = projectIdSchema.parse(req.params.id);

    const { role } = await getMemberRoleInWorkspace(userId, workspaceId);
    roleGuard(role, [Permissions.VIEW_ONLY]);

    const { project } = await getProjectByIdInWorkspaceService({
      workspaceId,
      projectId,
    });

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Project fetched successfully!",
      project,
    });
  }
);
export const getProjectAnaylyticsController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const workspaceId = workspaceIdSchema.parse(req.params.workspaceId);
    const projectId = projectIdSchema.parse(req.params.id);

    const { role } = await getMemberRoleInWorkspace(userId, workspaceId);
    roleGuard(role, [Permissions.VIEW_ONLY]);

    const { analytics } = await getProjectAnalyticsWorkspaceService({
      workspaceId,
      projectId,
    });

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Project analysis fetched successfully!",
      analytics,
    });
  }
);
export const updateProjectByIdInWorkspaceController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const projectId = projectIdSchema.parse(req.params.id);
    const workspaceId = workspaceIdSchema.parse(req.params.workspaceId);
    const combinedData = {
      ...req.body,
      createdBy: userId,
      workspace: req.params.workspaceId,
    };

    const validatedData = updateProjectSchema.parse(combinedData);

    const { role } = await getMemberRoleInWorkspace(userId, workspaceId);
    roleGuard(role, [Permissions.EDIT_PROJECT]);

    const { project } = await updateProjectService(validatedData, projectId);

    return res.status(HTTPSTATUS.CREATED).json({
      status: true,
      message: "Project updated successfully!",
      project,
    });
  }
);
export const deleteProjectByIdInWorkspaceController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const projectId = projectIdSchema.parse(req.params.id);
    const workspaceId = workspaceIdSchema.parse(req.params.workspaceId);

    const { role } = await getMemberRoleInWorkspace(userId, workspaceId);
    roleGuard(role, [Permissions.DELETE_PROJECT]);

    const { project } = await deleteProjectService({
      workspaceId,
      projectId,
      userId,
    });

    return res.status(HTTPSTATUS.CREATED).json({
      status: true,
      message: "Project deleted successfully!",
      project,
    });
  }
);
