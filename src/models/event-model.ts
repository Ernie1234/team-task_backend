import mongoose, { Document, Schema, Types } from "mongoose";

/** A calendar event: created in Team Task, or mirrored from the user's Google Calendar */
export interface EventDocument extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  /** Workspace it was created from (for links in reminders) */
  workspace: Types.ObjectId | null;
  title: string;
  description: string;
  location: string;
  start: Date;
  /** Exclusive end; for all-day events, midnight after the last day */
  end: Date;
  allDay: boolean;
  timeZone: string;
  /** Minutes before the start to remind; null = no reminder */
  reminderMinutes: number | null;
  /** When the next reminder is due (null = none pending) */
  nextReminderAt: Date | null;
  source: "local" | "google";
  /** Also kept in Google Calendar */
  syncToGoogle: boolean;
  googleEventId: string | null;
  googleCalendarId: string | null;
  googleUpdatedAt: Date | null;
  htmlLink: string | null;
  meetLink: string | null;
  syncError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new Schema<EventDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "" },
    location: { type: String, default: "" },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    allDay: { type: Boolean, default: false },
    timeZone: { type: String, default: "UTC" },
    reminderMinutes: { type: Number, default: 10 },
    nextReminderAt: { type: Date, default: null },
    source: { type: String, enum: ["local", "google"], default: "local" },
    syncToGoogle: { type: Boolean, default: false },
    googleEventId: { type: String, default: null },
    googleCalendarId: { type: String, default: null },
    googleUpdatedAt: { type: Date, default: null },
    htmlLink: { type: String, default: null },
    meetLink: { type: String, default: null },
    syncError: { type: String, default: null },
  },
  { timestamps: true }
);

eventSchema.index({ user: 1, start: 1 });
eventSchema.index({ nextReminderAt: 1 }, { partialFilterExpression: { nextReminderAt: { $type: "date" } } });
eventSchema.index({ user: 1, googleEventId: 1 }, { unique: true, partialFilterExpression: { googleEventId: { $type: "string" } } });

const EventModel = mongoose.model<EventDocument>("Event", eventSchema);
export default EventModel;
