import { Permissions } from "@/enums/role-enum";
import { workspaceIdSchema } from "./../validation/workspace-validation";
import { asyncHandler } from "@/middlewares/asyncHandlerMiddleware";
import { getMemberRoleInWorkspace } from "@/services/member-service";
import { roleGuard } from "@/utils/roleGuard";
import type { Request, Response } from "express";
import { HTTPSTATUS } from "@/config/http.config";
import {
  createTaskService,
  deleteTaskService,
  getAllTasksService,
  getATaskService,
  updateTaskService,
} from "@/services/task-service";
import { BadRequestException } from "@/utils/appError";
import {
  createTaskBodySchema,
  getAllTasksQuerySchema,
  taskParamsSchema,
  updateTaskBodySchema,
} from "@/validation/task-validation";
import { ZodError } from "zod";
import { ErrorCodeEnum } from "@/enums/errorCode.enum";

export const createTaskController = asyncHandler(
  async (req: Request, res: Response) => {
    try {
      // 1. Validate the URL parameters
      const { workspaceId, projectId } = taskParamsSchema.parse(req.params);
      // 2. Validate the request body
      const validatedBody = createTaskBodySchema.parse(req.body);
      // 3. Get the user ID from the request and ensure it exists
      const userId = req.user?._id;
      if (!userId)
        throw new BadRequestException("User ID is missing from the request.");
      // Check user permissions
      const { role } = await getMemberRoleInWorkspace(userId, workspaceId);
      roleGuard(role, [Permissions.CREATE_TASK]);
      // 4. Create the task using the validated data
      const { task } = await createTaskService({
        ...validatedBody,
        workspace: workspaceId,
        project: projectId,
        createdBy: userId,
      });
      return res.status(HTTPSTATUS.CREATED).json({
        status: true,
        message: "Task created successfully!",
        task,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException(
          "Validation failed.",
          ErrorCodeEnum.VALIDATION_ERROR
        );
      }
      throw error;
    }
  }
);
export const getAllTasksInProjectController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId)
      throw new BadRequestException("User ID is missing from the request.");

    const workspaceId = workspaceIdSchema.parse(req.params.workspaceId);
    const validatedQuery = getAllTasksQuerySchema.parse(req.query);
    const filters = {
      ...validatedQuery,
      status: validatedQuery.status
        ? validatedQuery.status.split(",")
        : undefined,
      priority: validatedQuery.priority
        ? validatedQuery.priority.split(",")
        : undefined,
      assignedTo: validatedQuery.assignedTo
        ? validatedQuery.assignedTo.split(",")
        : undefined,
    };

    const pagination = {
      pageSize: validatedQuery.pageSize
        ? parseInt(validatedQuery.pageSize, 10)
        : 10,
      pageNumber: validatedQuery.pageNumber
        ? parseInt(validatedQuery.pageNumber, 10)
        : 1,
    };

    // const filters = {
    //   projectId: req.query.projectId as string | undefined,
    //   status: req.query.status
    //     ? (req.query.status as string)?.split(",")
    //     : undefined,
    //   priority: req.query.priority
    //     ? (req.query.priority as string)?.split(",")
    //     : undefined,
    //   assignedTo: req.query.assignedTo
    //     ? (req.query.assignedTo as string)?.split(",")
    //     : undefined,
    //   keyword: (req.query.keyword as string) || undefined,
    //   dueDate: (req.query.dueDate as string) || undefined,
    // };

    // const pagination = {
    //   pageSize: parseInt(req.query.pageSize as string) || 10,
    //   pageNumber: parseInt(req.query.pageNumber as string) || 1,
    // };

    const { role } = await getMemberRoleInWorkspace(userId, workspaceId);
    roleGuard(role, [Permissions.VIEW_ONLY]);

    const { tasks, totalCount, notifications, activities } =
      await getAllTasksService({
        workspaceId,
        filters,
        pagination,
        userId,
      });

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Tasks retrieved successfully!",
      tasks,
      totalCount,
      notifications,
      activities,
    });
  }
);
export const getTaskByIdController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId)
      throw new BadRequestException("User ID is missing from the request.");

    const { workspaceId, projectId, taskId } = taskParamsSchema.parse(
      req.params
    );

    const { role } = await getMemberRoleInWorkspace(userId, workspaceId);
    roleGuard(role, [Permissions.VIEW_ONLY]);

    const { task } = await getATaskService({ workspaceId, projectId, taskId });

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Task fetched successfully!",
      task,
    });
  }
);
export const updateTaskByIdController = asyncHandler(
  async (req: Request, res: Response) => {
    const { workspaceId, projectId, taskId } = taskParamsSchema.parse(
      req.params
    );
    const validatedBody = updateTaskBodySchema.parse(req.body);

    const userId = req.user?._id;
    if (!userId)
      throw new BadRequestException("User ID is missing from the request.");

    const { role } = await getMemberRoleInWorkspace(userId, workspaceId);
    roleGuard(role, [Permissions.EDIT_TASK]);

    const { task } = await updateTaskService({
      taskId,
      workspaceId,
      projectId,
      ...validatedBody,
      userId,
    });

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Task updated successfully!",
      task,
    });
  }
);
export const deleteTaskByIdController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const { workspaceId, projectId, taskId } = taskParamsSchema.parse(
      req.params
    );

    const { role } = await getMemberRoleInWorkspace(userId, workspaceId);
    roleGuard(role, [Permissions.DELETE_TASK]);

    const { task } = await deleteTaskService({
      workspaceId,
      projectId,
      taskId,
      userId,
    });

    return res.status(HTTPSTATUS.CREATED).json({
      status: true,
      message: "Task deleted successfully!",
      task,
    });
  }
);
