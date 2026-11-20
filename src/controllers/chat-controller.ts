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
import {
  getWorkspaceConversationsService,
  getRoomAttachmentsService,
  markRoomReadService,
  resolveRoom,
  sendMessageService,
} from "@/services/chat-messaging-service";
import { toAttachment } from "@/config/uploads";

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

    // Throws unless both users share a workspace
    await resolveRoom(userId, { chatType: "direct", otherUserId });
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

// ---- Sending (REST fallback; the app normally sends over the socket) ----

const sendViaRest = (chatType: "workspace" | "project" | "direct", param: string) =>
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!._id.toString();
    const target = req.params[param];
    const { message } = await sendMessageService({
      senderId: userId,
      chatType,
      workspace: chatType === "workspace" ? target : undefined,
      project: chatType === "project" ? target : undefined,
      otherUserId: chatType === "direct" ? target : undefined,
      content: req.body?.content,
      replyTo: req.body?.replyTo,
      attachments: req.body?.attachments,
    });

    return res.status(HTTPSTATUS.CREATED).json({
      status: true,
      message: "Message sent successfully!",
      data: message,
    });
  });

export const sendWorkspaceMessageController = sendViaRest("workspace", "workspaceId");
export const sendProjectMessageController = sendViaRest("project", "projectId");
export const sendDirectMessageController = sendViaRest("direct", "otherUserId");

// Upload files for a chat message; returns attachments to send with it
export const uploadChatFilesController = asyncHandler(
  async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw new BadRequestException("No files uploaded");
    }

    return res.status(HTTPSTATUS.CREATED).json({
      status: true,
      message: "Files uploaded",
      attachments: files.map(toAttachment),
    });
  }
);

// Sidebar data: channels + DMs with last message and unread count
export const getWorkspaceConversationsController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!._id.toString();
    const { conversations } = await getWorkspaceConversationsService(
      userId,
      req.params.workspaceId!
    );

    return res.status(HTTPSTATUS.OK).json({
      status: true,
      message: "Conversations fetched successfully!",
      conversations,
    });
  }
);

// Photos and files shared in a conversation
export const getRoomAttachmentsController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!._id.toString();
    const limit = parseInt(req.query.limit as string) || 60;
    const { attachments } = await getRoomAttachmentsService(userId, req.params.roomId!, limit);
    return res.status(HTTPSTATUS.OK).json({ status: true, attachments });
  }
);

// Mark a room (e.g. "project:<id>") as read
export const markRoomReadController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!._id.toString();
    const result = await markRoomReadService(userId, req.body?.roomId);
    return res.status(HTTPSTATUS.OK).json({ status: true, ...result });
  }
);
