import mongoose, { Document, Schema } from "mongoose";

// When a user last read a chat room; drives unread counts.
// room: "workspace:<id>" | "project:<id>" | "direct:<userA>:<userB>" (ids sorted)
export interface ChatReadDocument extends Document {
  user: mongoose.Types.ObjectId;
  room: string;
  lastReadAt: Date;
}

const chatReadSchema = new Schema<ChatReadDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    room: { type: String, required: true },
    lastReadAt: { type: Date, required: true },
  },
  { timestamps: true }
);

chatReadSchema.index({ user: 1, room: 1 }, { unique: true });

const ChatReadModel = mongoose.model<ChatReadDocument>("ChatRead", chatReadSchema);
export default ChatReadModel;
