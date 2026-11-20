import mongoose from "mongoose";
import NoteModel, { type NoteDocument } from "@/models/note-model";
import { getSocketService } from "@/config/socket.config";
import { BadRequestException, ForbiddenException, NotFoundException } from "@/utils/appError";
import type { CreateNoteType, UpdateNoteType } from "@/validation/note-validation";

const AUTHOR = "name profilePicture";

/** Notes a user may see: their own, and anything shared with the workspace */
const visibleTo = (workspaceId: string, userId: string) => ({
  workspace: new mongoose.Types.ObjectId(workspaceId),
  $or: [{ visibility: "workspace" }, { createdBy: new mongoose.Types.ObjectId(userId) }],
});

const emitNoteChanged = (note: Pick<NoteDocument, "_id" | "workspace" | "visibility" | "createdBy">, action: "created" | "updated" | "deleted", by: string) => {
  const rooms = note.visibility === "workspace" ? [`presence:${note.workspace}`] : [`user:${note.createdBy}`];
  getSocketService()?.emitToRooms(rooms, "note:changed", {
    action,
    noteId: String(note._id),
    workspaceId: String(note.workspace),
    by,
  });
};

/** Load a note the user can see, or throw 404 (private notes look like they don't exist) */
const findVisibleNote = async (workspaceId: string, noteId: string, userId: string) => {
  const note = await NoteModel.findOne({ _id: noteId, ...visibleTo(workspaceId, userId) });
  if (!note) throw new NotFoundException("Note not found");
  return note;
};

/** Ids of a note and all its descendants */
const collectTree = async (rootId: mongoose.Types.ObjectId) => {
  const ids = [rootId];
  let frontier = [rootId];
  // Pages are rarely deep; stop at 20 levels just in case
  for (let depth = 0; depth < 20 && frontier.length; depth++) {
    const children = await NoteModel.find({ parentNote: { $in: frontier } }).select("_id").lean();
    frontier = children.map((c) => c._id as mongoose.Types.ObjectId);
    ids.push(...frontier);
  }
  return ids;
};

/** Every note the user can see in the workspace, without content (for the page tree) */
export const getNotesService = async (workspaceId: string, userId: string) => {
  const notes = await NoteModel.find(visibleTo(workspaceId, userId))
    .select("-content")
    .sort({ updatedAt: -1 })
    .populate("createdBy", AUTHOR)
    .populate("lastEditedBy", AUTHOR)
    .lean();
  return { notes };
};

export const getNoteService = async (workspaceId: string, noteId: string, userId: string) => {
  const note = await findVisibleNote(workspaceId, noteId, userId);
  await note.populate([
    { path: "createdBy", select: AUTHOR },
    { path: "lastEditedBy", select: AUTHOR },
  ]);
  return { note };
};

export const createNoteService = async (workspaceId: string, userId: string, data: CreateNoteType) => {
  let visibility = data.visibility ?? "private";
  if (data.parentNote) {
    const parent = await findVisibleNote(workspaceId, data.parentNote, userId);
    // A sub-page starts with its parent's sharing
    visibility = data.visibility ?? parent.visibility;
  }
  const note = await NoteModel.create({
    title: data.title ?? "",
    emoji: data.emoji ?? null,
    content: data.content ?? [],
    workspace: workspaceId,
    createdBy: userId,
    lastEditedBy: userId,
    parentNote: data.parentNote ?? null,
    visibility,
  });
  emitNoteChanged(note, "created", userId);
  return { note };
};

export const updateNoteService = async (workspaceId: string, noteId: string, userId: string, data: UpdateNoteType) => {
  const note = await findVisibleNote(workspaceId, noteId, userId);
  const isOwner = String(note.createdBy) === userId;

  // Only the creator decides who can see a note
  if (data.visibility && data.visibility !== note.visibility && !isOwner) {
    throw new ForbiddenException("Only the person who created this note can change who sees it");
  }
  if (data.parentNote !== undefined && data.parentNote !== null) {
    if (data.parentNote === noteId) throw new BadRequestException("A note can't be inside itself");
    await findVisibleNote(workspaceId, data.parentNote, userId);
    const tree = await collectTree(note._id);
    if (tree.some((id) => String(id) === data.parentNote)) {
      throw new BadRequestException("A note can't be moved inside one of its own sub-pages");
    }
  }

  const wasShared = note.visibility === "workspace";
  Object.assign(note, data, { lastEditedBy: userId });
  await note.save();

  emitNoteChanged(note, "updated", userId);
  // Made private: let the others' lists drop it
  if (wasShared && note.visibility === "private") emitNoteChanged({ ...note.toObject(), visibility: "workspace" }, "deleted", userId);

  await note.populate([
    { path: "createdBy", select: AUTHOR },
    { path: "lastEditedBy", select: AUTHOR },
  ]);
  return { note };
};

/** Deletes a note with all its sub-pages. Shared notes: creator only. */
export const deleteNoteService = async (workspaceId: string, noteId: string, userId: string) => {
  const note = await findVisibleNote(workspaceId, noteId, userId);
  if (String(note.createdBy) !== userId) {
    throw new ForbiddenException("Only the person who created this note can delete it");
  }
  const ids = await collectTree(note._id);
  await NoteModel.deleteMany({ _id: { $in: ids } });
  emitNoteChanged(note, "deleted", userId);
  return { deletedIds: ids.map(String) };
};
