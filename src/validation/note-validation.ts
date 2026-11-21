import { z } from "zod";
import mongoose from "mongoose";
import { NOTE_VISIBILITY } from "@/models/note-model";

const objectId = () => z.string().trim().refine((v) => mongoose.isValidObjectId(v), "Invalid id");

// Editor documents are stored as-is; cap their size so one note can't bloat the database
const MAX_CONTENT_BYTES = 1_500_000;
const content = z
  .array(z.record(z.string(), z.unknown()))
  .max(5000)
  .refine((blocks) => JSON.stringify(blocks).length <= MAX_CONTENT_BYTES, "This note is too large to save");

export const noteIdSchema = objectId();

export const createNoteSchema = z.object({
  title: z.string().trim().max(200).optional(),
  emoji: z.string().trim().max(16).nullable().optional(),
  content: content.optional(),
  parentNote: objectId().nullable().optional(),
  visibility: z.enum(NOTE_VISIBILITY).optional(),
});

export const updateNoteSchema = z
  .object({
    title: z.string().trim().max(200),
    emoji: z.string().trim().max(16).nullable(),
    content,
    excerpt: z.string().max(400),
    visibility: z.enum(NOTE_VISIBILITY),
    parentNote: objectId().nullable(),
    /** Sent by the live editor: content is a snapshot of the shared document */
    live: z.boolean(),
  })
  .partial()
  .strict();

export type CreateNoteType = z.infer<typeof createNoteSchema>;
export type UpdateNoteType = z.infer<typeof updateNoteSchema>;
