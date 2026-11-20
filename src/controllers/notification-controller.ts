import { HTTPSTATUS } from "@/config/http.config";
import { asyncHandler } from "@/middlewares/asyncHandlerMiddleware";
import { BadRequestException } from "@/utils/appError";
import { workspaceIdSchema } from "@/validation/workspace-validation";
import type { Request, Response } from "express";
import { notificationIdsSchema } from "@/validation/notification-validation";
import { getMemberRoleInWorkspace } from "@/services/member-service";
import {
  getWorkspaceNotificationsService,
  markAllNotificationsAsReadService,
  markNotificationsAsReadService,
} from "@/services/notification-service";

const requireUserId = (req: Request): string => {
  const userId = req.user?._id;
  if (!userId) {
    throw new BadRequestException("User ID is missing from the request.");
  }
  return String(userId);
};

export const getAllWorkspaceNotificationsController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const workspaceId = workspaceIdSchema.parse(req.params.workspaceId);
    await getMemberRoleInWorkspace(userId, workspaceId);

    const { notifications, unreadCount } = await getWorkspaceNotificationsService(
      userId,
      workspaceId
    );

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Fetched Successfully",
      data: notifications,
      unreadCount,
    });
  }
);

export const markNotificationsAsReadController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const notificationIds = notificationIdsSchema.parse(req.body.notificationIds);

    const { modifiedCount } = await markNotificationsAsReadService(
      userId,
      notificationIds
    );

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: `Successfully marked ${modifiedCount} notifications as read.`,
      data: { modifiedCount },
    });
  }
);

export const markAllNotificationsAsReadController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const workspaceId = workspaceIdSchema.parse(req.params.workspaceId);
    await getMemberRoleInWorkspace(userId, workspaceId);

    const { modifiedCount } = await markAllNotificationsAsReadService(
      userId,
      workspaceId
    );

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message:
        modifiedCount === 0
          ? "No unread notifications found."
          : `Successfully marked ${modifiedCount} notifications as read.`,
      data: { modifiedCount },
    });
  }
);
