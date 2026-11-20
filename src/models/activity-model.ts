import mongoose, { Schema, Document } from "mongoose";

export interface ActivityDocument extends Document {
  message: string;
  user: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const activitySchema = new Schema<ActivityDocument>(
  {
    message: {
      type: String,
      required: true,
      trim: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

activitySchema.index({ workspaceId: 1, createdAt: -1 });

// Push every new activity to members currently viewing the workspace.
// (They're subscribed to its presence room; see socket.config.)
activitySchema.post("save", async function (doc) {
  try {
    const { getSocketService } = await import("@/config/socket.config");
    const socketService = getSocketService();
    if (!socketService) return;
    await doc.populate("user", "name email profilePicture");
    socketService.emitToRooms([`presence:${doc.workspaceId}`], "activity:new", {
      activity: doc.toObject(),
    });
  } catch {
    // Live updates are best-effort; the activity itself is already saved
  }
});

const ActivityModel = mongoose.model<ActivityDocument>(
  "Activity",
  activitySchema
);
export default ActivityModel;
