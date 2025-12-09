import type { Request, Response } from "express";

import { HTTPSTATUS } from "@/config/http.config";
import { asyncHandler } from "@/middlewares/asyncHandlerMiddleware";
import { 
  getMessagesService, 
  getOnlineUsersService, 
  getWorkspaceMembersService,
  searchMessagesService,
  markMessagesAsReadService,
  getWorkspaceStatsService,
  verifyWorkspaceAccessService,
  verifyProjectAccessService,
  getDirectConversationsService
} from "@/services/chat-service";
import { BadRequestException, ForbiddenException } from "@/utils/appError";

// Get messages for workspace chat
export const getWorkspaceMessagesController = asyncHandler(
  async (req: Request, res: Response) => {
    const { workspaceId } = req.params;
    const { limit, skip, before } = req.query;
    const userId = req.user!._id.toString();

    if (!workspaceId) {
      throw new BadRequestException("Workspace ID is required");
    }

    // Verify user has access to this workspace
    const hasAccess = await verifyWorkspaceAccessService(userId, workspaceId);
    if (!hasAccess) {
      throw new ForbiddenException("Access denied to workspace");
    }

    const result = await getMessagesService({
      chatType: "workspace",
      workspace: workspaceId,
      limit: limit ? parseInt(limit as string) : undefined,
      skip: skip ? parseInt(skip as string) : undefined,
      before: before as string,
    });

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Workspace messages fetched successfully!",
      messages: result.messages,
      pagination: {
        hasMore: result.hasMore,
        total: result.total,
      },
    });
  }
);

// Get messages for project chat
export const getProjectMessagesController = asyncHandler(
  async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const { limit, skip, before } = req.query;
    const userId = req.user!._id.toString();

    if (!projectId) {
      throw new BadRequestException("Project ID is required");
    }

    // Verify user has access to this project
    const hasAccess = await verifyProjectAccessService(userId, projectId);
    if (!hasAccess) {
      throw new ForbiddenException("Access denied to project");
    }

    const result = await getMessagesService({
      chatType: "project",
      project: projectId,
      limit: limit ? parseInt(limit as string) : undefined,
      skip: skip ? parseInt(skip as string) : undefined,
      before: before as string,
    });

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Project messages fetched successfully!",
      messages: result.messages,
      pagination: {
        hasMore: result.hasMore,
        total: result.total,
      },
    });
  }
);

// Get direct messages between users
export const getDirectMessagesController = asyncHandler(
  async (req: Request, res: Response) => {
    const { otherUserId } = req.params;
    const { limit, skip, before } = req.query;
    const userId = req.user!._id.toString();

    if (!otherUserId) {
      throw new BadRequestException("Other user ID is required");
    }

    const participants = [userId, otherUserId].sort(); // Sort for consistent ordering

    const result = await getMessagesService({
      chatType: "direct",
      participants,
      limit: limit ? parseInt(limit as string) : undefined,
      skip: skip ? parseInt(skip as string) : undefined,
      before: before as string,
    });

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Direct messages fetched successfully!",
      messages: result.messages,
      pagination: {
        hasMore: result.hasMore,
        total: result.total,
      },
    });
  }
);

// Get online users in a workspace
export const getOnlineUsersController = asyncHandler(
  async (req: Request, res: Response) => {
    const { workspaceId } = req.params;
    const userId = req.user!._id.toString();

    if (!workspaceId) {
      throw new BadRequestException("Workspace ID is required");
    }

    // Verify user has access to this workspace
    const hasAccess = await verifyWorkspaceAccessService(userId, workspaceId);
    if (!hasAccess) {
      throw new ForbiddenException("Access denied to workspace");
    }

    const onlineUsers = await getOnlineUsersService(workspaceId);

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Online users fetched successfully!",
      onlineUsers,
    });
  }
);

// Get all workspace members for chat
export const getWorkspaceMembersController = asyncHandler(
  async (req: Request, res: Response) => {
    const { workspaceId } = req.params;
    const userId = req.user!._id.toString();

    if (!workspaceId) {
      throw new BadRequestException("Workspace ID is required");
    }

    // Verify user has access to this workspace
    const hasAccess = await verifyWorkspaceAccessService(userId, workspaceId);
    if (!hasAccess) {
      throw new ForbiddenException("Access denied to workspace");
    }

    const members = await getWorkspaceMembersService(workspaceId);

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Workspace members fetched successfully!",
      members,
    });
  }
);

// Search messages in workspace
export const searchWorkspaceMessagesController = asyncHandler(
  async (req: Request, res: Response) => {
    const { workspaceId } = req.params;
    const { q, limit } = req.query;
    const userId = req.user!._id.toString();

    if (!workspaceId) {
      throw new BadRequestException("Workspace ID is required");
    }

    if (!q || typeof q !== "string") {
      throw new BadRequestException("Search query is required");
    }

    // Verify user has access to this workspace
    const hasAccess = await verifyWorkspaceAccessService(userId, workspaceId);
    if (!hasAccess) {
      throw new ForbiddenException("Access denied to workspace");
    }

    const messages = await searchMessagesService(
      "workspace",
      q,
      workspaceId,
      undefined,
      undefined,
      limit ? parseInt(limit as string) : undefined
    );

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Messages search completed successfully!",
      messages,
      query: q,
    });
  }
);

// Search messages in project
export const searchProjectMessagesController = asyncHandler(
  async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const { q, limit } = req.query;
    const userId = req.user!._id.toString();

    if (!projectId) {
      throw new BadRequestException("Project ID is required");
    }

    if (!q || typeof q !== "string") {
      throw new BadRequestException("Search query is required");
    }

    // Verify user has access to this project
    const hasAccess = await verifyProjectAccessService(userId, projectId);
    if (!hasAccess) {
      throw new ForbiddenException("Access denied to project");
    }

    const messages = await searchMessagesService(
      "project",
      q,
      undefined,
      projectId,
      undefined,
      limit ? parseInt(limit as string) : undefined
    );

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Project messages search completed successfully!",
      messages,
      query: q,
    });
  }
);

// Mark messages as read
export const markMessagesAsReadController = asyncHandler(
  async (req: Request, res: Response) => {
    const { lastMessageId } = req.body;
    const userId = req.user!._id.toString();

    await markMessagesAsReadService(userId, lastMessageId);

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Messages marked as read successfully!",
    });
  }
);

// Get workspace chat statistics
export const getWorkspaceStatsController = asyncHandler(
  async (req: Request, res: Response) => {
    const { workspaceId } = req.params;
    const userId = req.user!._id.toString();

    if (!workspaceId) {
      throw new BadRequestException("Workspace ID is required");
    }

    // Verify user has access to this workspace
    const hasAccess = await verifyWorkspaceAccessService(userId, workspaceId);
    if (!hasAccess) {
      throw new ForbiddenException("Access denied to workspace");
    }

    const stats = await getWorkspaceStatsService(workspaceId);

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Workspace chat statistics fetched successfully!",
      stats,
    });
  }
);

// Get direct message conversations for current user
export const getDirectConversationsController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!._id.toString();

    const conversations = await getDirectConversationsService(userId);

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Direct conversations fetched successfully!",
      conversations,
    });
  }
);

// Send a message to workspace chat
export const sendWorkspaceMessageController = asyncHandler(
  async (req: Request, res: Response) => {
    const { workspaceId } = req.params;
    const { content, messageType, replyTo } = req.body;
    const userId = req.user!._id.toString();

    if (!workspaceId) {
      throw new BadRequestException("Workspace ID is required");
    }

    if (!content || !content.trim()) {
      throw new BadRequestException("Message content is required");
    }

    // Verify user has access to this workspace
    const hasAccess = await verifyWorkspaceAccessService(userId, workspaceId);
    if (!hasAccess) {
      throw new ForbiddenException("Access denied to workspace");
    }

    const { createMessageService } = await import("@/services/chat-service");
    const message = await createMessageService({
      content: content.trim(),
      sender: userId,
      chatType: "workspace",
      workspace: workspaceId,
      messageType: messageType || "text",
      replyTo: replyTo || null,
    });

    // Populate sender info
    await message.populate("sender", "name profilePicture");
    if (replyTo) {
      await message.populate({
        path: "replyTo",
        select: "content sender",
        populate: {
          path: "sender",
          select: "name",
        },
      });
    }

    return res.status(HTTPSTATUS.CREATED).json({
      status: true,
      message: "Message sent successfully!",
      data: message,
    });
  }
);

// Send a message to project chat
export const sendProjectMessageController = asyncHandler(
  async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const { content, messageType, replyTo } = req.body;
    const userId = req.user!._id.toString();

    if (!projectId) {
      throw new BadRequestException("Project ID is required");
    }

    if (!content || !content.trim()) {
      throw new BadRequestException("Message content is required");
    }

    // Verify user has access to this project
    const hasAccess = await verifyProjectAccessService(userId, projectId);
    if (!hasAccess) {
      throw new ForbiddenException("Access denied to project");
    }

    const { createMessageService } = await import("@/services/chat-service");
    const message = await createMessageService({
      content: content.trim(),
      sender: userId,
      chatType: "project",
      project: projectId,
      messageType: messageType || "text",
      replyTo: replyTo || null,
    });

    // Populate sender info
    await message.populate("sender", "name profilePicture");
    if (replyTo) {
      await message.populate({
        path: "replyTo",
        select: "content sender",
        populate: {
          path: "sender",
          select: "name",
        },
      });
    }

    return res.status(HTTPSTATUS.CREATED).json({
      status: true,
      message: "Message sent successfully!",
      data: message,
    });
  }
);

// Send a direct message
export const sendDirectMessageController = asyncHandler(
  async (req: Request, res: Response) => {
    const { otherUserId } = req.params;
    const { content, messageType, replyTo } = req.body;
    const userId = req.user!._id.toString();

    if (!otherUserId) {
      throw new BadRequestException("Other user ID is required");
    }

    if (!content || !content.trim()) {
      throw new BadRequestException("Message content is required");
    }

    const participants = [userId, otherUserId].sort(); // Sort for consistent ordering

    const { createMessageService } = await import("@/services/chat-service");
    const message = await createMessageService({
      content: content.trim(),
      sender: userId,
      chatType: "direct",
      participants,
      messageType: messageType || "text",
      replyTo: replyTo || null,
    });

    // Populate sender info
    await message.populate("sender", "name profilePicture");
    if (replyTo) {
      await message.populate({
        path: "replyTo",
        select: "content sender",
        populate: {
          path: "sender",
          select: "name",
        },
      });
    }

    return res.status(HTTPSTATUS.CREATED).json({
      status: true,
      message: "Message sent successfully!",
      data: message,
    });
  }
);
