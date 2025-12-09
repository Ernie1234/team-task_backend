import { Server as SocketIOServer } from "socket.io";
import Logger from "@/utils/logger";
import MessageModel from "@/models/message-model";
import { AuthenticatedSocket } from "@/config/socket.config";
import { createMessageService, verifyWorkspaceAccessService, verifyProjectAccessService } from "@/services/chat-service";

export const chatSocketHandlers = (socket: AuthenticatedSocket, io: SocketIOServer) => {
  // Handle sending a message
  socket.on("message:send", async (data) => {
    try {
      const { content, chatType, workspace, project, otherUserId, replyTo, messageType = "text" } = data;
      
      // Validate input
      if (!content || content.trim().length === 0) {
        socket.emit("error", { message: "Message content is required" });
        return;
      }

      if (content.length > 2000) {
        socket.emit("error", { message: "Message too long (max 2000 characters)" });
        return;
      }

      if (!chatType || !["workspace", "project", "direct"].includes(chatType)) {
        socket.emit("error", { message: "Valid chat type is required" });
        return;
      }

      let messageData: any = {
        content: content.trim(),
        sender: socket.userId!,
        chatType,
        messageType,
        replyTo: replyTo || null,
      };

      let roomName = "";

      // Validate and set room based on chat type
      switch (chatType) {
        case "workspace":
          if (!workspace) {
            socket.emit("error", { message: "Workspace ID is required for workspace chat" });
            return;
          }
          const hasWorkspaceAccess = await verifyWorkspaceAccessService(socket.userId!, workspace);
          if (!hasWorkspaceAccess) {
            socket.emit("error", { message: "Access denied to workspace" });
            return;
          }
          messageData.workspace = workspace;
          roomName = `workspace:${workspace}`;
          break;

        case "project":
          if (!project) {
            socket.emit("error", { message: "Project ID is required for project chat" });
            return;
          }
          const hasProjectAccess = await verifyProjectAccessService(socket.userId!, project);
          if (!hasProjectAccess) {
            socket.emit("error", { message: "Access denied to project" });
            return;
          }
          messageData.project = project;
          roomName = `project:${project}`;
          break;

        case "direct":
          if (!otherUserId) {
            socket.emit("error", { message: "Other user ID is required for direct messages" });
            return;
          }
          const participants = [socket.userId!, otherUserId].sort();
          messageData.participants = participants;
          roomName = `direct:${participants.join(":")}`;
          Logger.info(`Creating direct message room: ${roomName}`, { participants });
          break;
      }

      // Create message
      const message = await createMessageService(messageData);

      // Populate sender info
      await message.populate("sender", "name profilePicture");
      if (replyTo) {
        await message.populate("replyTo", "content sender");
      }

      // Emit to all users in the appropriate room
      io.to(roomName).emit("message:new", {
        message: {
          _id: message._id,
          content: message.content,
          chatType: message.chatType,
          sender: {
            _id: message.sender._id,
            name: message.sender.name,
            profilePicture: message.sender.profilePicture,
          },
          workspace: message.workspace,
          project: message.project,
          participants: message.participants,
          messageType: message.messageType,
          replyTo: message.replyTo,
          isEdited: message.isEdited,
          isDeleted: message.isDeleted,
          reactions: message.reactions,
          createdAt: message.createdAt,
        },
      });

      Logger.info(`Message sent by ${socket.userId} in ${chatType} chat: ${roomName}`);
    } catch (error) {
      Logger.error("Error sending message:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // Handle message editing
  socket.on("message:edit", async (data) => {
    try {
      const { messageId, content } = data;

      if (!content || content.trim().length === 0) {
        socket.emit("error", { message: "Message content is required" });
        return;
      }

      if (content.length > 2000) {
        socket.emit("error", { message: "Message too long (max 2000 characters)" });
        return;
      }

      const message = await MessageModel.findOneAndUpdate(
        {
          _id: messageId,
          sender: socket.userId,
          workspace: socket.workspaceId,
          isDeleted: false,
        },
        {
          content: content.trim(),
          isEdited: true,
          editedAt: new Date(),
        },
        { new: true }
      ).populate("sender", "name profilePicture");

      if (!message) {
        socket.emit("error", { message: "Message not found or cannot be edited" });
        return;
      }

      // Emit to all users in workspace
      io.to(`workspace:${socket.workspaceId}`).emit("message:edited", {
        messageId: message._id,
        content: message.content,
        isEdited: message.isEdited,
        editedAt: message.editedAt,
      });

      Logger.info(`Message edited by ${socket.userId} in workspace ${socket.workspaceId}`);
    } catch (error) {
      Logger.error("Error editing message:", error);
      socket.emit("error", { message: "Failed to edit message" });
    }
  });

  // Handle message deletion
  socket.on("message:delete", async (data) => {
    try {
      const { messageId } = data;

      const message = await MessageModel.findOneAndUpdate(
        {
          _id: messageId,
          sender: socket.userId,
          workspace: socket.workspaceId,
          isDeleted: false,
        },
        {
          isDeleted: true,
          deletedAt: new Date(),
          content: "This message was deleted",
        },
        { new: true }
      );

      if (!message) {
        socket.emit("error", { message: "Message not found or cannot be deleted" });
        return;
      }

      // Emit to all users in workspace
      io.to(`workspace:${socket.workspaceId}`).emit("message:deleted", {
        messageId: message._id,
      });

      Logger.info(`Message deleted by ${socket.userId} in workspace ${socket.workspaceId}`);
    } catch (error) {
      Logger.error("Error deleting message:", error);
      socket.emit("error", { message: "Failed to delete message" });
    }
  });

  // Handle message reactions
  socket.on("message:react", async (data) => {
    try {
      const { messageId, emoji } = data;

      if (!emoji || typeof emoji !== "string" || emoji.length === 0) {
        socket.emit("error", { message: "Valid emoji is required" });
        return;
      }

      const message = await MessageModel.findOne({
        _id: messageId,
        workspace: socket.workspaceId,
        isDeleted: false,
      });

      if (!message) {
        socket.emit("error", { message: "Message not found" });
        return;
      }

      // Check if user already reacted with this emoji
      const existingReaction = message.reactions.find(
        (r) => r.user.toString() === socket.userId && r.emoji === emoji
      );

      if (existingReaction) {
        // Remove reaction
        message.reactions = message.reactions.filter(
          (r) => !(r.user.toString() === socket.userId && r.emoji === emoji)
        );
      } else {
        // Add reaction
        message.reactions.push({
          user: socket.userId as any,
          emoji,
        });
      }

      await message.save();
      await message.populate("reactions.user", "name profilePicture");

      // Emit to all users in workspace
      io.to(`workspace:${socket.workspaceId}`).emit("message:reaction", {
        messageId: message._id,
        reactions: message.reactions,
      });

      Logger.info(`Message reaction by ${socket.userId} in workspace ${socket.workspaceId}`);
    } catch (error) {
      Logger.error("Error handling message reaction:", error);
      socket.emit("error", { message: "Failed to react to message" });
    }
  });

  // Handle joining chat rooms
  socket.on("room:join", async (data) => {
    try {
      const { chatType, workspace, project, otherUserId } = data;
      
      if (!chatType || !["workspace", "project", "direct"].includes(chatType)) {
        socket.emit("error", { message: "Valid chat type is required" });
        return;
      }

      let roomName = "";
      let hasAccess = false;

      switch (chatType) {
        case "workspace":
          if (!workspace) {
            socket.emit("error", { message: "Workspace ID is required" });
            return;
          }
          hasAccess = await verifyWorkspaceAccessService(socket.userId!, workspace);
          roomName = `workspace:${workspace}`;
          break;

        case "project":
          if (!project) {
            socket.emit("error", { message: "Project ID is required" });
            return;
          }
          hasAccess = await verifyProjectAccessService(socket.userId!, project);
          roomName = `project:${project}`;
          break;

        case "direct":
          if (!otherUserId) {
            socket.emit("error", { message: "Other user ID is required" });
            return;
          }
          const participants = [socket.userId!, otherUserId].sort();
          roomName = `direct:${participants.join(":")}`;
          hasAccess = true; // Any authenticated user can start direct messages
          break;
      }

      if (!hasAccess) {
        socket.emit("error", { message: `Access denied to ${chatType} chat` });
        return;
      }

      // Join the room
      await socket.join(roomName);
      socket.emit("room:joined", { chatType, roomName });
      
      Logger.info(`User ${socket.userId} joined ${chatType} room: ${roomName}`);
    } catch (error) {
      Logger.error("Error joining room:", error);
      socket.emit("error", { message: "Failed to join room" });
    }
  });

  // Handle leaving chat rooms
  socket.on("room:leave", async (data) => {
    try {
      const { roomName } = data;
      
      if (!roomName) {
        socket.emit("error", { message: "Room name is required" });
        return;
      }

      await socket.leave(roomName);
      socket.emit("room:left", { roomName });
      
      Logger.info(`User ${socket.userId} left room: ${roomName}`);
    } catch (error) {
      Logger.error("Error leaving room:", error);
      socket.emit("error", { message: "Failed to leave room" });
    }
  });
};