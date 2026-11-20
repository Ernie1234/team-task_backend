import mongoose, { Document, Schema, Types } from "mongoose";

/** A user's linked Google Calendar (tokens are encrypted, see utils/token-crypto) */
export interface CalendarConnectionDocument extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  /** Workspace the calendar was connected from (imported events link there) */
  workspace: Types.ObjectId | null;
  provider: "google";
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
  calendarId: string;
  timeZone: string | null;
  status: "active" | "error";
  lastError: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const calendarConnectionSchema = new Schema<CalendarConnectionDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", default: null },
    provider: { type: String, enum: ["google"], default: "google" },
    email: { type: String, default: "" },
    accessToken: { type: String, required: true, select: false },
    refreshToken: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    scope: { type: String, default: "" },
    calendarId: { type: String, default: "primary" },
    timeZone: { type: String, default: null },
    status: { type: String, enum: ["active", "error"], default: "active" },
    lastError: { type: String, default: null },
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const CalendarConnectionModel = mongoose.model<CalendarConnectionDocument>("CalendarConnection", calendarConnectionSchema);
export default CalendarConnectionModel;
