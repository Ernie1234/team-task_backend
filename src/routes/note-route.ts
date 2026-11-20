import { Router } from "express";
import {
  createNoteController,
  deleteNoteController,
  getNoteController,
  getNotesController,
  updateNoteController,
} from "@/controllers/note-controller";

const noteRoute = Router();

noteRoute.get("/workspace/:workspaceId", getNotesController);
noteRoute.post("/workspace/:workspaceId", createNoteController);
noteRoute.get("/workspace/:workspaceId/:noteId", getNoteController);
noteRoute.patch("/workspace/:workspaceId/:noteId", updateNoteController);
noteRoute.delete("/workspace/:workspaceId/:noteId", deleteNoteController);

export default noteRoute;
