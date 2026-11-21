import { Server as SocketIOServer } from "socket.io";
import Logger from "@/utils/logger";
import type { AuthenticatedSocket } from "@/config/socket.config";
import { AppError } from "@/utils/appError";
import {
  deleteMessageService,
  editMessageService,
  markRoomReadService,
  reactToMessageService,
  resolveRoom,
  sendMessageService,
  type ChatType,
} from "@/services/chat-messaging-service";

type Ack = (response: { ok: boolean; error?: string; [key: string]: unknown }) => void;

/**
 * Wrap a handler so it always answers the client's ack (when given) and turns
 * errors into { ok: false, error } instead of crashing or going silent.
 */
export const withAck =
  (name: string, handler: (data: any) => Promise<Record<string, unknown> | void>) =>
  async (data: any, ack?: Ack) => {
    const respond: Ack = typeof ack === "function" ? ack : () => {};
    try {
      const result = await handler(data ?? {});
      respond({ ok: true, ...(result ?? {}) });
    } catch (error) {
      const message = error instanceof AppError ? error.message : "Something went wrong";
      if (!(error instanceof AppError)) Logger.error(`Socket ${name} failed:`, error);
      respond({ ok: false, error: message });
    }
  };

export const chatSocketHandlers = (socket: AuthenticatedSocket, _io: SocketIOServer) => {
  const userId = socket.userId!;

  socket.on(
    "message:send",
    withAck("message:send", async (data) => {
      const { message, roomId } = await sendMessageService({
        senderId: userId,
        chatType: data.chatType,
        workspace: data.workspace,
        project: data.project,
        otherUserId: data.otherUserId,
        content: data.content,
        replyTo: data.replyTo,
        attachments: data.attachments,
        clientId: data.clientId,
      });
      return { message: message.toObject(), roomId, clientId: data.clientId };
    })
  );

  socket.on(
    "message:edit",
    withAck("message:edit", async ({ messageId, content }) => {
      await editMessageService(userId, messageId, content);
    })
  );

  socket.on(
    "message:delete",
    withAck("message:delete", async ({ messageId }) => {
      await deleteMessageService(userId, messageId);
    })
  );

  socket.on(
    "message:react",
    withAck("message:react", async ({ messageId, emoji }) => {
      await reactToMessageService(userId, messageId, emoji);
    })
  );

  socket.on(
    "room:read",
    withAck("room:read", async ({ roomId }) => {
      await markRoomReadService(userId, roomId);
    })
  );

  // Channels (workspace/project) are socket rooms. DMs need no join: they're
  // delivered to each user's personal room.
  socket.on(
    "room:join",
    withAck("room:join", async (data) => {
      const room = await resolveRoom(userId, {
        chatType: data.chatType as ChatType,
        workspace: data.workspace,
        project: data.project,
        otherUserId: data.otherUserId,
      });
      if (room.chatType !== "direct") {
        await socket.join(room.roomId);
      }
      socket.emit("room:joined", { chatType: room.chatType, roomName: room.roomId });
      return { roomId: room.roomId };
    })
  );

  socket.on(
    "room:leave",
    withAck("room:leave", async ({ roomName }) => {
      // Never leave your own personal room
      if (typeof roomName === "string" && !roomName.startsWith("user:")) {
        await socket.leave(roomName);
      }
    })
  );
};
