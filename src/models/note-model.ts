import mongoose, { Document, Schema, Types } from "mongoose";

export const NOTE_VISIBILITY = ["private", "workspace"] as const;
export type NoteVisibility = (typeof NOTE_VISIBILITY)[number];

/** A Notion-style page: title, icon and a document of editor blocks. */
export interface NoteDocument extends Document {
  _id: Types.ObjectId;
  title: string;
  emoji: string | null;
  /** Editor blocks (BlockNote JSON) */
  content: unknown[];
  /** Plain-text start of the note, for previews and search */
  excerpt: string;
  /** Live-editing document (Yjs state). The editor works on this; `content` is a snapshot of it */
  ydoc: Buffer | null;
  workspace: Types.ObjectId;
  createdBy: Types.ObjectId;
  lastEditedBy: Types.ObjectId;
  /** Set on sub-pages */
  parentNote: Types.ObjectId | null;
  /** private: only the creator; workspace: every member */
  visibility: NoteVisibility;
  createdAt: Date;
  updatedAt: Date;
}

const noteSchema = new Schema<NoteDocument>(
  {
    title: { type: String, default: "", trim: true, maxlength: 200 },
    emoji: { type: String, default: null },
    content: { type: [Schema.Types.Mixed], default: [] },
    excerpt: { type: String, default: "" },
    ydoc: { type: Buffer, default: null, select: false },
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastEditedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    parentNote: { type: Schema.Types.ObjectId, ref: "Note", default: null },
    visibility: { type: String, enum: NOTE_VISIBILITY, default: "private" },
  },
  { timestamps: true }
);

noteSchema.index({ workspace: 1, visibility: 1, updatedAt: -1 });
noteSchema.index({ workspace: 1, createdBy: 1, updatedAt: -1 });
noteSchema.index({ parentNote: 1 });

const NoteModel = mongoose.model<NoteDocument>("Note", noteSchema);
export default NoteModel;
