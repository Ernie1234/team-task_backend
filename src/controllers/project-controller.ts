import type { Request, Response } from "express";

import { asyncHandler } from "@/middlewares/asyncHandlerMiddleware";
import { HTTPSTATUS } from "@/config/http.config";

export const createProjectController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Project controller!",
      userId,
    });
  }
);
