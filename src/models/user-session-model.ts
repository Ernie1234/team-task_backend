import mongoose, { Document, Schema, Types } from "mongoose";

/** A signed-in browser/device, for Account → Devices ("log out of this device") */
export interface UserSessionDocument extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  sessionId: string;
  userAgent: string;
  ip: string;
  lastActiveAt: Date;
  createdAt: Date;
}

const userSessionSchema = new Schema<UserSessionDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sessionId: { type: String, required: true, unique: true, select: false },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
    lastActiveAt: { type: Date, default: () => new Date() },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const UserSessionModel = mongoose.model<UserSessionDocument>("UserSession", userSessionSchema);
export default UserSessionModel;
