import fs from "fs";
import mongoose from "mongoose";
import MessageModel, {
  type MessageAttachment,
  type MessageDocument,
} from "@/models/message-model";
import MemberModel from "@/models/member-model";
import ProjectModel from "@/models/project-model";
import UserModel, { type UserDocument } from "@/models/user-model";
import ChatReadModel from "@/models/chat-read-model";
import { getSocketService } from "@/config/socket.config";
import {
  IMAGE_EXTENSIONS,
  MAX_FILES_PER_MESSAGE,
  resolveChatUploadPath,
} from "@/config/uploads";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@/utils/appError";
import Logger from "@/utils/logger";
import {
  getProjectWorkspaceId,
  getUserWorkspaceIds,
  isWorkspaceMember,
} from "@/utils/membership-cache";

export type ChatType = "workspace" | "project" | "direct";

export type RoomTarget = {
  chatType: ChatType;
  workspace?: string;
  project?: string;
  otherUserId?: string;
};

type ResolvedRoom = {
  roomId: string;
  chatType: ChatType;
  // Fields stored on messages in this room / used to query them
  fields: {
    workspace?: mongoose.Types.ObjectId;
    project?: mongoose.Types.ObjectId;
    participants?: mongoose.Types.ObjectId[];
  };
  // For DMs: both users (messages are pushed to their personal rooms)
  participantIds?: string[];
};

export const MAX_MESSAGE_LENGTH = 2000;

const isObjectId = (value: unknown): value is string =>
  typeof value === "string" && mongoose.Types.ObjectId.isValid(value);

const oid = (value: string | mongoose.Types.ObjectId) =>
  new mongoose.Types.ObjectId(String(value));

export const directRoomId = (a: string, b: string) => `direct:${[a, b].sort().join(":")}`;

// Populate everything the chat UI renders for a message
export const MESSAGE_POPULATE = [
  { path: "sender", select: "name profilePicture" },
  {
    path: "replyTo",
    select: "content sender attachments isDeleted",
    populate: { path: "sender", select: "name" },
  },
  { path: "reactions.user", select: "name profilePicture" },
];

export const roomIdForMessage = (message: MessageDocument): string => {
  switch (message.chatType) {
    case "workspace":
      return `workspace:${message.workspace}`;
    case "project":
      return `project:${message.project}`;
    default:
      return directRoomId(
        String(message.participants?.[0]),
        String(message.participants?.[1])
      );
  }
};

/** Check the user may use this room and work out how its messages are stored. */
export const resolveRoom = async (userId: string, target: RoomTarget): Promise<ResolvedRoom> => {
  switch (target.chatType) {
    case "workspace": {
      if (!isObjectId(target.workspace)) throw new BadRequestException("Workspace ID is required");
      if (!(await isWorkspaceMember(userId, target.workspace))) {
        throw new ForbiddenException("Access denied to workspace");
      }
      return {
        roomId: `workspace:${target.workspace}`,
        chatType: "workspace",
        fields: { workspace: oid(target.workspace) },
      };
    }

    case "project": {
      if (!isObjectId(target.project)) throw new BadRequestException("Project ID is required");
      const projectWorkspaceId = await getProjectWorkspaceId(target.project);
      if (!projectWorkspaceId) throw new NotFoundException("Project not found");
      if (!(await isWorkspaceMember(userId, projectWorkspaceId))) {
        throw new ForbiddenException("Access denied to project");
      }
      return {
        roomId: `project:${target.project}`,
        chatType: "project",
        fields: { project: oid(target.project), workspace: oid(projectWorkspaceId) },
      };
    }

    case "direct": {
      const otherUserId = target.otherUserId;
      if (!isObjectId(otherUserId)) throw new BadRequestException("Other user ID is required");
      if (otherUserId === userId) throw new BadRequestException("You can't message yourself");

      // Only people who share a workspace can message each other
      const [mine, theirs] = await Promise.all([
        getUserWorkspaceIds(userId),
        getUserWorkspaceIds(otherUserId),
      ]);
      const theirSet = new Set(theirs);
      if (!mine.some((id) => theirSet.has(id))) {
        throw new ForbiddenException("You can only message people in your workspaces");
      }

      const participantIds = [userId, otherUserId].sort();
      return {
        roomId: directRoomId(userId, otherUserId),
        chatType: "direct",
        fields: { participants: participantIds.map(oid) },
        participantIds,
      };
    }

    default:
      throw new BadRequestException("Valid chat type is required");
  }
};

/** Same as resolveRoom, from a room id like "project:<id>" or "direct:<a>:<b>". */
export const resolveRoomById = (userId: string, roomId: string) => {
  const [type, first, second] = String(roomId).split(":");
  if (type === "workspace") return resolveRoom(userId, { chatType: "workspace", workspace: first });
  if (type === "project") return resolveRoom(userId, { chatType: "project", project: first });
  if (type === "direct") {
    if (first !== userId && second !== userId) {
      throw new ForbiddenException("Access denied to conversation");
    }
    return resolveRoom(userId, {
      chatType: "direct",
      otherUserId: first === userId ? second : first,
    });
  }
  throw new BadRequestException("Invalid room");
};

/** Message query filter for a resolved room. */
export const roomMessageFilter = (room: ResolvedRoom) => {
  if (room.chatType === "workspace") return { chatType: "workspace", workspace: room.fields.workspace };
  if (room.chatType === "project") return { chatType: "project", project: room.fields.project };
  return { chatType: "direct", participants: { $all: room.fields.participants } };
};

/** Push an event to everyone in a room. DMs go to both users' personal rooms. */
const broadcast = (room: Pick<ResolvedRoom, "roomId" | "participantIds">, event: string, payload: unknown) => {
  const socketService = getSocketService();
  if (!socketService) return;
  if (room.participantIds) {
    socketService.emitToRooms(room.participantIds.map((id) => `user:${id}`), event, payload);
  } else {
    socketService.emitToRooms([room.roomId], event, payload);
  }
};

const broadcastForMessage = (message: MessageDocument, event: string, payload: object) => {
  const roomId = roomIdForMessage(message);
  broadcast(
    {
      roomId,
      participantIds:
        message.chatType === "direct" ? message.participants?.map(String) : undefined,
    },
    event,
    { ...payload, roomId }
  );
};

const validateAttachments = (attachments: unknown): MessageAttachment[] => {
  if (attachments === undefined || attachments === null) return [];
  if (!Array.isArray(attachments)) throw new BadRequestException("Invalid attachments");
  if (attachments.length > MAX_FILES_PER_MESSAGE) {
    throw new BadRequestException(`You can attach up to ${MAX_FILES_PER_MESSAGE} files`);
  }

  return attachments.map((item) => {
    const filePath = resolveChatUploadPath(item?.url);
    if (!filePath || !fs.existsSync(filePath)) {
      throw new BadRequestException("Attachment not found. Please upload it again.");
    }
    return {
      url: item.url,
      name: String(item.name ?? "file").slice(0, 255),
      size: Number(item.size) || 0,
      mimeType: String(item.mimeType ?? "application/octet-stream"),
    };
  });
};

const markReadAt = async (userId: string, roomId: string, at: Date) => {
  await ChatReadModel.updateOne(
    { user: oid(userId), room: roomId },
    { $max: { lastReadAt: at } },
    { upsert: true }
  );
};

export type SendMessageInput = RoomTarget & {
  senderId: string;
  // Id the sender's app gave its optimistic copy; echoed back so it can be swapped for the real one
  clientId?: unknown;
  content?: string;
  replyTo?: string | null;
  attachments?: unknown;
};

/** Validate, save and broadcast a chat message. Used by both socket and REST. */
export const sendMessageService = async (input: SendMessageInput) => {
  const content = typeof input.content === "string" ? input.content.trim() : "";
  const attachments = validateAttachments(input.attachments);

  if (!content && attachments.length === 0) {
    throw new BadRequestException("Message content is required");
  }
  if (content.length > MAX_MESSAGE_LENGTH) {
    throw new BadRequestException(`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`);
  }

  if (input.replyTo && !isObjectId(input.replyTo)) throw new BadRequestException("Invalid reply");

  // Access check and reply lookup are independent: do them together
  const [room, original] = await Promise.all([
    resolveRoom(input.senderId, input),
    input.replyTo ? MessageModel.findById(input.replyTo).select("chatType workspace project participants") : null,
  ]);

  let replyTo: mongoose.Types.ObjectId | null = null;
  if (input.replyTo) {
    if (!original || roomIdForMessage(original) !== room.roomId) {
      throw new BadRequestException("The message you replied to isn't in this conversation");
    }
    replyTo = original._id as mongoose.Types.ObjectId;
  }

  const messageType =
    attachments.length === 0
      ? "text"
      : attachments.every((a) => a.mimeType.startsWith("image/") && IMAGE_EXTENSIONS.test(a.url))
        ? "image"
        : "file";

  const message = await MessageModel.create({
    content,
    attachments,
    sender: oid(input.senderId),
    chatType: room.chatType,
    ...room.fields,
    messageType,
    replyTo,
  });
  // A new message has no reactions yet: only the sender (and quoted message) need filling in
  await message.populate(MESSAGE_POPULATE.filter((p) => p.path !== "reactions.user" && (replyTo || p.path !== "replyTo")));

  const clientId =
    typeof input.clientId === "string" && input.clientId.length <= 64 ? input.clientId : undefined;
  broadcast(room, "message:new", { message: message.toObject(), roomId: room.roomId, clientId });

  // Your own message counts as read (nobody needs to wait for this)
  markReadAt(input.senderId, room.roomId, message.createdAt).catch((error) =>
    Logger.warn("Couldn't update read marker:", error)
  );

  return { message, roomId: room.roomId };
};

const findOwnMessage = async (userId: string, messageId: string) => {
  if (!isObjectId(messageId)) throw new BadRequestException("Invalid message");
  const message = await MessageModel.findById(messageId);
  if (!message || message.isDeleted) throw new NotFoundException("Message not found");
  if (String(message.sender) !== userId) {
    throw new ForbiddenException("You can only change your own messages");
  }
  return message;
};

export const editMessageService = async (userId: string, messageId: string, rawContent: unknown) => {
  const content = typeof rawContent === "string" ? rawContent.trim() : "";
  if (content.length > MAX_MESSAGE_LENGTH) {
    throw new BadRequestException(`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`);
  }

  const message = await findOwnMessage(userId, messageId);
  if (!content && message.attachments.length === 0) {
    throw new BadRequestException("Message content is required");
  }

  message.content = content;
  message.isEdited = true;
  message.editedAt = new Date();
  await message.save();

  broadcastForMessage(message, "message:edited", {
    messageId: String(message._id),
    content: message.content,
    isEdited: true,
    editedAt: message.editedAt,
  });
  return message;
};

export const deleteMessageService = async (userId: string, messageId: string) => {
  const message = await findOwnMessage(userId, messageId);
  const files = message.attachments.map((a) => resolveChatUploadPath(a.url)).filter(Boolean) as string[];

  message.isDeleted = true;
  message.deletedAt = new Date();
  message.content = "";
  message.attachments = [];
  message.reactions = [];
  await message.save();

  // Remove the files too; a failure here is harmless
  files.forEach((file) =>
    fs.promises.unlink(file).catch((error) => Logger.warn(`Couldn't delete ${file}:`, error))
  );

  broadcastForMessage(message, "message:deleted", { messageId: String(message._id) });
  return message;
};

export const reactToMessageService = async (userId: string, messageId: string, emoji: unknown) => {
  if (typeof emoji !== "string" || emoji.length === 0 || emoji.length > 16) {
    throw new BadRequestException("Valid emoji is required");
  }
  if (!isObjectId(messageId)) throw new BadRequestException("Invalid message");

  const message = await MessageModel.findById(messageId);
  if (!message || message.isDeleted) throw new NotFoundException("Message not found");
  await resolveRoomById(userId, roomIdForMessage(message)); // access check

  const index = message.reactions.findIndex(
    (r) => String(r.user) === userId && r.emoji === emoji
  );
  if (index >= 0) {
    message.reactions.splice(index, 1);
  } else {
    message.reactions.push({ user: oid(userId), emoji });
  }
  await message.save();
  await message.populate("reactions.user", "name profilePicture");

  broadcastForMessage(message, "message:reaction", {
    messageId: String(message._id),
    reactions: message.toObject().reactions,
  });
  return message;
};

export const markRoomReadService = async (userId: string, roomId: string) => {
  await resolveRoomById(userId, roomId);
  const lastReadAt = new Date();
  await markReadAt(userId, roomId, lastReadAt);
  // Clear the badge in the user's other tabs too
  getSocketService()?.emitToUser(userId, "room:read", { roomId, lastReadAt });
  return { roomId, lastReadAt };
};

// Same id for a message's room inside MongoDB (DM ids sorted, like directRoomId)
const ROOM_KEY_EXPR = {
  $switch: {
    branches: [
      { case: { $eq: ["$chatType", "workspace"] }, then: { $concat: ["workspace:", { $toString: "$workspace" }] } },
      { case: { $eq: ["$chatType", "project"] }, then: { $concat: ["project:", { $toString: "$project" }] } },
    ],
    default: {
      $concat: [
        "direct:",
        { $toString: { $min: [{ $arrayElemAt: ["$participants", 0] }, { $arrayElemAt: ["$participants", 1] }] } },
        ":",
        { $toString: { $max: [{ $arrayElemAt: ["$participants", 0] }, { $arrayElemAt: ["$participants", 1] }] } },
      ],
    },
  },
};

/**
 * Everything the chat sidebar shows for a workspace: the general channel, one
 * channel per project, and a DM with every other member, each with its last
 * message and unread count for this user.
 *
 * Built in three database rounds (the database may be ~130 ms away):
 * 1. membership, projects, members, read markers  (in parallel)
 * 2. last message per room + unread per room       (two aggregations, in parallel)
 * 3. senders of those last messages
 */
export const getWorkspaceConversationsService = async (userId: string, workspaceId: string) => {
  if (!isObjectId(workspaceId)) throw new BadRequestException("Workspace ID is required");
  const me = oid(userId);

  const [isMember, projects, members, reads] = await Promise.all([
    isWorkspaceMember(userId, workspaceId),
    ProjectModel.find({ workspace: workspaceId }).select("name emoji").sort({ createdAt: 1 }).lean(),
    MemberModel.find({ workspaceId, userId: { $ne: userId } })
      .populate<{ userId: UserDocument | null }>("userId", "name email profilePicture isOnline lastSeen")
      .populate<{ role: { name: string } | null }>("role", "name")
      .lean(),
    ChatReadModel.find({ user: me }).select("room lastReadAt").lean(),
  ]);
  if (!isMember) throw new ForbiddenException("Access denied to workspace");

  type Entry = { roomId: string; match: Record<string, unknown>; base: Record<string, unknown> };

  const entries: Entry[] = [
    {
      roomId: `workspace:${workspaceId}`,
      match: { chatType: "workspace", workspace: oid(workspaceId) },
      base: { type: "workspace", name: "general", workspace: workspaceId },
    },
    ...projects.map((project) => ({
      roomId: `project:${project._id}`,
      match: { chatType: "project", project: project._id },
      base: {
        type: "project",
        name: project.name,
        emoji: project.emoji,
        project: String(project._id),
        workspace: workspaceId,
      },
    })),
    ...members
      .filter((member) => member.userId)
      .map((member) => {
        const other = member.userId!;
        return {
          roomId: directRoomId(userId, String(other._id)),
          match: { chatType: "direct", participants: { $all: [me, other._id] } },
          base: {
            type: "direct",
            name: other.name,
            otherUser: {
              _id: String(other._id),
              name: other.name,
              email: other.email,
              profilePicture: other.profilePicture ?? undefined,
              isOnline: other.isOnline,
              lastSeen: other.lastSeen,
              role: member.role?.name,
            },
          },
        };
      }),
  ];

  const readByRoom = new Map(reads.map((r) => [r.room, r.lastReadAt]));

  const [lastPerRoom, unreadPerRoom] = await Promise.all([
    MessageModel.aggregate([
      { $match: { $or: entries.map((e) => e.match) } },
      { $sort: { createdAt: -1 } },
      { $addFields: { roomKey: ROOM_KEY_EXPR } },
      { $group: { _id: "$roomKey", last: { $first: "$$ROOT" } } },
    ]),
    MessageModel.aggregate([
      {
        $match: {
          sender: { $ne: me },
          isDeleted: false,
          $or: entries.map((e) => {
            const lastReadAt = readByRoom.get(e.roomId);
            return lastReadAt ? { ...e.match, createdAt: { $gt: lastReadAt } } : e.match;
          }),
        },
      },
      { $addFields: { roomKey: ROOM_KEY_EXPR } },
      { $group: { _id: "$roomKey", count: { $sum: 1 } } },
    ]),
  ]);

  const lastMessages = lastPerRoom.map((row) => row.last);
  await MessageModel.populate(lastMessages, { path: "sender", select: "name profilePicture" });

  const lastByRoom = new Map(lastPerRoom.map((row) => [row._id as string, row.last]));
  const unreadByRoom = new Map(unreadPerRoom.map((row) => [row._id as string, row.count as number]));

  const conversations = entries.map((entry) => ({
    id: entry.roomId,
    ...entry.base,
    lastMessage: lastByRoom.get(entry.roomId) ?? null,
    unreadCount: unreadByRoom.get(entry.roomId) ?? 0,
  }));

  return { conversations };
};

/** Photos and files shared in a room, newest first (for the details panel). */
export const getRoomAttachmentsService = async (userId: string, roomId: string, limit = 60) => {
  const room = await resolveRoomById(userId, roomId);
  const messages = await MessageModel.find({
    ...roomMessageFilter(room),
    isDeleted: false,
    "attachments.0": { $exists: true },
  })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .select("attachments sender createdAt")
    .populate("sender", "name")
    .lean();

  const attachments = messages.flatMap((message) =>
    message.attachments.map((attachment) => ({
      ...attachment,
      messageId: String(message._id),
      sender: message.sender,
      createdAt: message.createdAt,
    }))
  );
  return { attachments };
};
