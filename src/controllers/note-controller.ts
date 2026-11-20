import type { Request, Response } from "express";
import { HTTPSTATUS } from "@/config/http.config";
import { asyncHandler } from "@/middlewares/asyncHandlerMiddleware";
import { workspaceIdSchema } from "@/validation/workspace-validation";
import { createNoteSchema, noteIdSchema, updateNoteSchema } from "@/validation/note-validation";
import { getMemberRoleInWorkspace } from "@/services/member-service";
import {
  createNoteService,
  deleteNoteService,
  getNoteService,
  getNotesService,
  updateNoteService,
} from "@/services/note-service";

const context = async (req: Request) => {
  const userId = String(req.user?._id);
  const workspaceId = workspaceIdSchema.parse(req.params.workspaceId);
  await getMemberRoleInWorkspace(userId, workspaceId);
  return { userId, workspaceId };
};

export const getNotesController = asyncHandler(async (req: Request, res: Response) => {
  const { userId, workspaceId } = await context(req);
  const { notes } = await getNotesService(workspaceId, userId);
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Notes fetched", notes });
});

export const getNoteController = asyncHandler(async (req: Request, res: Response) => {
  const { userId, workspaceId } = await context(req);
  const noteId = noteIdSchema.parse(req.params.noteId);
  const { note } = await getNoteService(workspaceId, noteId, userId);
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Note fetched", note });
});

export const createNoteController = asyncHandler(async (req: Request, res: Response) => {
  const { userId, workspaceId } = await context(req);
  const data = createNoteSchema.parse(req.body ?? {});
  const { note } = await createNoteService(workspaceId, userId, data);
  return res.status(HTTPSTATUS.CREATED).json({ status: true, message: "Note created", note });
});

export const updateNoteController = asyncHandler(async (req: Request, res: Response) => {
  const { userId, workspaceId } = await context(req);
  const noteId = noteIdSchema.parse(req.params.noteId);
  const data = updateNoteSchema.parse(req.body ?? {});
  const { note } = await updateNoteService(workspaceId, noteId, userId, data);
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Note saved", note });
});

export const deleteNoteController = asyncHandler(async (req: Request, res: Response) => {
  const { userId, workspaceId } = await context(req);
  const noteId = noteIdSchema.parse(req.params.noteId);
  const { deletedIds } = await deleteNoteService(workspaceId, noteId, userId);
  return res.status(HTTPSTATUS.OK).json({ status: true, message: "Note deleted", deletedIds });
});
