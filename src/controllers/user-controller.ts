import { HTTPSTATUS } from "@/config/http.config";
import { asyncHandler } from "@/middlewares/asyncHandlerMiddleware";
import { fetchCurrentUser } from "@/services/user-service";
import type { Request, Response } from "express";

export const getCurrentUserController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const { user } = await fetchCurrentUser(userId);

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "User fetch Successfully!",
      user,
    });
  }
);
