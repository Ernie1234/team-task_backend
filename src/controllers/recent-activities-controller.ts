import type { Request, Response } from "express";

import { asyncHandler } from "@/middlewares/asyncHandlerMiddleware";
import { BadRequestException } from "@/utils/appError";
import { workspaceIdSchema } from "@/validation/workspace-validation";
import ActivityModel from "@/models/activity-model";
import { HTTPSTATUS } from "@/config/http.config";
import { getMemberRoleInWorkspace } from "@/services/member-service";

export const getAllWorkspaceRecentActivitiesController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) {
      throw new BadRequestException("User ID is missing from the request.");
    }

    const workspaceId = workspaceIdSchema.parse(req.params.workspaceId);
    // Only members can read a workspace's activity
    await getMemberRoleInWorkspace(String(userId), workspaceId);

    // Pagination, with sane bounds
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    const [recentActivities, totalActivities] = await Promise.all([
      ActivityModel.find({ workspaceId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name email profilePicture"),
      ActivityModel.countDocuments({ workspaceId }),
    ]);

    const totalPages = Math.ceil(totalActivities / limit);

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Fetched Successfully",
      data: recentActivities,
      pagination: {
        page,
        limit,
        totalPages,
        totalActivities,
        hasMore: page < totalPages,
      },
    });
  }
);
