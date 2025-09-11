import type { Request, Response } from "express";

import { asyncHandler } from "@/middlewares/asyncHandlerMiddleware";
import { BadRequestException } from "@/utils/appError";
import { workspaceIdSchema } from "@/validation/workspace-validation";
import ActivityModel from "@/models/activity-model";
import { HTTPSTATUS } from "@/config/http.config";

export const getAllWorkspaceRecentActivitiesController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) {
      throw new BadRequestException("User ID is missing from the request.");
    }

    const workspaceId = workspaceIdSchema.parse(req.params.workspaceId);

    const recentActivities = await ActivityModel.find({
      workspaceId,
    })
      .sort({ createdAt: -1 })
      .populate("user", "name email -password");

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Fetched Successfully",
      data: recentActivities,
    });
  }
);
