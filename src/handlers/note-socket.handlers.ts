import type { AuthenticatedSocket } from "@/config/socket.config";
import { withAck } from "@/handlers/chat-socket.handlers";
import { applyNoteAwareness, applyNoteUpdate, joinNote, leaveAllNotes, leaveNote, seedNote } from "@/services/note-collab-service";
import { BadRequestException } from "@/utils/appError";
import Logger from "@/utils/logger";

/** Live co-editing of Notes (see services/note-collab-service.ts) */
export const noteSocketHandlers = (socket: AuthenticatedSocket) => {
  const userId = socket.userId!;

  socket.on(
    "note:join",
    withAck("note:join", async ({ workspaceId, noteId }) => {
      if (typeof workspaceId !== "string" || typeof noteId !== "string") throw new BadRequestException("workspaceId and noteId are required");
      return joinNote(socket.id, userId, workspaceId, noteId);
    })
  );

  socket.on("note:seed", withAck("note:seed", async ({ noteId, update }) => seedNote(socket.id, noteId, update)));

  // Edits and cursors are fire-and-forget: they arrive often and order is kept by the socket
  socket.on("note:update", ({ noteId, update } = {}) => {
    try {
      applyNoteUpdate(socket.id, noteId, update);
    } catch (error) {
      Logger.warn(`note:update from ${socket.id} rejected: ${(error as Error).message}`);
      socket.emit("note:resync", { noteId });
    }
  });

  socket.on("note:awareness", ({ noteId, update } = {}) => {
    try {
      applyNoteAwareness(socket.id, noteId, update);
    } catch {
      // A dropped cursor update is harmless
    }
  });

  socket.on("note:leave", ({ noteId } = {}) => leaveNote(socket.id, noteId));
  socket.on("disconnect", () => leaveAllNotes(socket.id));
};
