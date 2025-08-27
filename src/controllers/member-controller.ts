import { HTTPSTATUS } from "@/config/http.config";
import { asyncHandler } from "@/middlewares/asyncHandlerMiddleware";
import { joinWorkspaceByInvite } from "@/services/member-service";
import { inviteCodeSchema } from "@/validation/invite-code-validation";
import type { Request, Response } from "express";

export const joinWorkspaceController = asyncHandler(
  async (req: Request, res: Response) => {
    const { inviteCode } = inviteCodeSchema.parse({
      inviteCode: req.params.inviteCode,
    });
    const userId = req.user?._id;

    const { workspaceId, role } = await joinWorkspaceByInvite(
      userId,
      inviteCode
    );

    return res.status(HTTPSTATUS.CREATED).json({
      status: true,
      message: "Member role changed successfully!",
      workspaceId,
      role,
    });
  }
);
