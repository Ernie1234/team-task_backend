import MessageModel, { MessageDocument } from "@/models/message-model";
import UserModel from "@/models/user-model";
import WorkspaceModel from "@/models/workspace-model";
import MemberModel from "@/models/member-model";
import ProjectModel from "@/models/project-model";
import mongoose from "mongoose";
import { BadRequestException, ForbiddenException, NotFoundException } from "@/utils/appError";

export interface CreateMessageData {
  content: string;
  sender: string;
  chatType: "workspace" | "project" | "direct";
  workspace?: string;
  project?: string;
  participants?: string[];
  messageType?: "text" | "image" | "file" | "system";
  replyTo?: string | null;
}

export interface GetMessagesQuery {
  chatType: "workspace" | "project" | "direct";
  workspace?: string;
  project?: string;
  participants?: string[];
  limit?: number;
  skip?: number;
  before?: string; // Message ID for pagination
}
// Create a new message
export const createMessageService = async (data: CreateMessageData): Promise<MessageDocument> => {
  // Validate message data based on chat type
  if (data.chatType === "workspace" && !data.workspace) {
    throw new BadRequestException("Workspace ID is required for workspace chat");
  }
  if (data.chatType === "project" && (!data.project || !data.workspace)) {
    throw new BadRequestException("Project and Workspace IDs are required for project chat");
  }
  if (data.chatType === "direct" && (!data.participants || data.participants.length !== 2)) {
    throw new BadRequestException("Exactly 2 participants are required for direct messages");
  }

  const message = new MessageModel({
    content: data.content,
    sender: data.sender,
    chatType: data.chatType,
    workspace: data.workspace,
    project: data.project,
    participants: data.participants,
    messageType: data.messageType || "text",
    replyTo: data.replyTo,
  });

  return await message.save();
};

// Get messages with pagination
export const getMessagesService = async (query: GetMessagesQuery): Promise<{
  messages: MessageDocument[];
  hasMore: boolean;
  total: number;
}> => {
  const limit = Math.min(query.limit || 50, 100); // Max 100 messages per request
  const skip = query.skip || 0;

  // Build query filter based on chat type
  const filter: any = {
    chatType: query.chatType,
    isDeleted: false,
  };

  switch (query.chatType) {
    case "workspace":
      if (!query.workspace) throw new BadRequestException("Workspace ID is required");
      filter.workspace = query.workspace;
      break;
    case "project":
      if (!query.project) throw new BadRequestException("Project ID is required");
      filter.project = query.project;
      break;
    case "direct":
      if (!query.participants || query.participants.length !== 2) {
        throw new BadRequestException("Exactly 2 participants are required");
      }
      filter.participants = { $all: query.participants };
      break;
  }

  // If 'before' is provided, get messages before that message
  if (query.before) {
    const beforeMessage = await MessageModel.findById(query.before);
    if (beforeMessage) {
      filter.createdAt = { $lt: beforeMessage.createdAt };
    }
  }

  // Get messages with pagination
  const messages = await MessageModel
    .find(filter)
    .populate("sender", "name profilePicture -password")
    .populate({
      path: "replyTo",
      select: "content sender",
      populate: {
        path: "sender",
        select: "name",
      },
    })
    .populate("reactions.user", "name profilePicture")
    .sort({ createdAt: -1 }) // Latest first
    .limit(limit)
    .skip(skip);

  // Get total count for hasMore calculation
  const total = await MessageModel.countDocuments(filter);
  const hasMore = skip + messages.length < total;

  return {
    messages: messages.reverse(), // Reverse to show oldest first
    hasMore,
    total,
  };
};

// Get online users in a workspace
export const getOnlineUsersService = async (workspaceId: string): Promise<any[]> => {
  // Get all members of the workspace who are online
  const members = await MemberModel
    .find({ workspaceId })
    .populate({
      path: "userId",
      match: { isOnline: true },
      select: "name profilePicture isOnline lastSeen",
    })
    .populate("role", "name");

  // Filter out members whose user is null (offline users won't match)
  return members
    .filter(member => member.userId)
    .map(member => ({
      _id: member.userId._id,
      name: member.userId.name,
      profilePicture: member.userId.profilePicture,
      isOnline: member.userId.isOnline,
      lastSeen: member.userId.lastSeen,
      role: member.role,
    }));
};

// Verify if user has access to a workspace (for socket authentication)
export const verifyWorkspaceAccessService = async (userId: string, workspaceId: string): Promise<boolean> => {
  try {
    // Check if user is a member of the workspace
    const member = await MemberModel.findOne({
      userId,
      workspaceId,
    });

    return !!member;
  } catch (error) {
    return false;
  }
};

// Verify if user has access to a project
export const verifyProjectAccessService = async (userId: string, projectId: string): Promise<boolean> => {
  try {
    // First get the project to find its workspace
    const project = await ProjectModel.findById(projectId);
    if (!project) return false;

    // Then check if user is a member of the workspace that contains this project
    const member = await MemberModel.findOne({
      userId,
      workspaceId: project.workspace,
    });

    return !!member;
  } catch (error) {
    return false;
  }
};

// Get workspace members for chat (all members, not just online)
export const getWorkspaceMembersService = async (workspaceId: string): Promise<any[]> => {
  const members = await MemberModel
    .find({ workspaceId })
    .populate("userId", "name profilePicture isOnline lastSeen")
    .populate("role", "name permissions");

  return members.map(member => ({
    _id: member.userId._id,
    name: member.userId.name,
    profilePicture: member.userId.profilePicture,
    isOnline: member.userId.isOnline,
    lastSeen: member.userId.lastSeen,
    role: {
      name: member.role.name,
      permissions: member.role.permissions,
    },
    joinedAt: member.createdAt,
  }));
};

// Mark messages as read (for future read receipts feature)
export const markMessagesAsReadService = async (userId: string, lastMessageId?: string): Promise<void> => {
  // This is a placeholder for read receipts functionality
  // You can implement this later if needed
  
  // For now, just update the user's last seen timestamp
  await UserModel.findByIdAndUpdate(userId, {
    lastSeen: new Date(),
  });
};

// Search messages
export const searchMessagesService = async (
  chatType: "workspace" | "project" | "direct",
  searchTerm: string,
  workspace?: string,
  project?: string,
  participants?: string[],
  limit = 20
): Promise<MessageDocument[]> => {
  if (!searchTerm.trim()) {
    return [];
  }

  const filter: any = {
    chatType,
    isDeleted: false,
    content: { $regex: searchTerm.trim(), $options: "i" },
  };

  // Add specific filters based on chat type
  switch (chatType) {
    case "workspace":
      if (workspace) filter.workspace = workspace;
      break;
    case "project":
      if (project) filter.project = project;
      break;
    case "direct":
      if (participants) filter.participants = { $all: participants };
      break;
  }

  const messages = await MessageModel
    .find(filter)
    .populate("sender", "name profilePicture")
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 50));

  return messages;
};

// Get message statistics for a workspace
export const getWorkspaceStatsService = async (workspaceId: string): Promise<{
  totalMessages: number;
  todayMessages: number;
  activeUsers: number;
}> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalMessages, todayMessages, activeUsers] = await Promise.all([
    // Total messages in workspace
    MessageModel.countDocuments({
      workspace: workspaceId,
      chatType: "workspace",
      isDeleted: false,
    }),

    // Messages sent today
    MessageModel.countDocuments({
      workspace: workspaceId,
      chatType: "workspace",
      isDeleted: false,
      createdAt: { $gte: today },
    }),

    // Users who sent messages in the last 7 days
    MessageModel.aggregate([
      {
        $match: {
          workspace: new mongoose.Types.ObjectId(workspaceId),
          chatType: "workspace",
          isDeleted: false,
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: "$sender",
        },
      },
      {
        $count: "activeUsers",
      },
    ]).then(result => result[0]?.activeUsers || 0),
  ]);

  return {
    totalMessages,
    todayMessages,
    activeUsers,
  };
};

// Get direct message conversations for a user
export const getDirectConversationsService = async (userId: string): Promise<any[]> => {
  // Get all unique conversations where the user is a participant
  const conversations = await MessageModel.aggregate([
    {
      $match: {
        chatType: "direct",
        participants: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
      },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $group: {
        _id: "$participants",
        lastMessage: { $first: "$$ROOT" },
        unreadCount: {
          $sum: {
            $cond: [{ $ne: ["$sender", new mongoose.Types.ObjectId(userId)] }, 1, 0],
          },
        },
      },
    },
  ]);

  // Populate participant details
  await MessageModel.populate(conversations, {
    path: "lastMessage.sender",
    select: "name profilePicture",
  });

  await MessageModel.populate(conversations, {
    path: "_id",
    select: "name profilePicture isOnline lastSeen",
  });

  return conversations.map(conv => {
    const otherUser = conv._id.find((p: any) => p._id.toString() !== userId);
    return {
      conversationId: conv._id,
      otherUser,
      lastMessage: conv.lastMessage,
      unreadCount: conv.unreadCount,
    };
  });
};
