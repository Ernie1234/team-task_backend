import { HTTPSTATUS } from "@/config/http.config";
import { asyncHandler } from "@/middlewares/asyncHandlerMiddleware";
import { BadRequestException } from "@/utils/appError";
import { workspaceIdSchema } from "@/validation/workspace-validation";
import type { Request, Response } from "express";
import NotificationModel from "@/models/notification-model";
import { Types } from "mongoose";
import { notificationIdsSchema } from "@/validation/notification-validation";

export const markAllNotificationsAsReadController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) {
      throw new BadRequestException("User ID is missing from the request.");
    }

    const workspaceId = workspaceIdSchema.parse(req.params.workspaceId);

    const result = await NotificationModel.updateMany(
      {
        recipient: new Types.ObjectId(userId),
        workspaceId: new Types.ObjectId(workspaceId),
        isRead: false,
      },
      {
        $set: { isRead: true },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(HTTPSTATUS.OK).json({
        status: true,
        message: "No unread notifications found.",
        data: {
          modifiedCount: 0,
        },
      });
    }

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: `Successfully marked ${result.modifiedCount} notifications as read.`,
      data: {
        modifiedCount: result.modifiedCount,
      },
    });
  }
);

export const markNotificationsAsReadController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) {
      throw new BadRequestException("User ID is missing from the request.");
    }

    const { notificationIds } = req.body;
    const parsedIds = notificationIdsSchema.parse(notificationIds);

    const result = await NotificationModel.updateMany(
      {
        _id: { $in: parsedIds.map((id: string) => new Types.ObjectId(id)) },
        recipient: new Types.ObjectId(userId),
        isRead: false,
      },
      {
        $set: { isRead: true },
      }
    );

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: `Successfully marked ${result.modifiedCount} notifications as read.`,
      data: {
        modifiedCount: result.modifiedCount,
      },
    });
  }
);
