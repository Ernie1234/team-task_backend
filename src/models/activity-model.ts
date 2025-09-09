import mongoose, { Schema, Document } from "mongoose";

export interface ActivityDocument extends Document {
  user: mongoose.Types.ObjectId;
  action: string;
  targetType: string;
  targetId: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const activitySchema = new Schema<ActivityDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    targetType: {
      type: String,
      required: true,
      trim: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
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

const ActivityModel = mongoose.model<ActivityDocument>(
  "Activity",
  activitySchema
);
export default ActivityModel;
