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

const ActivityModel = mongoose.model<ActivityDocument>(
  "Activity",
  activitySchema
);
export default ActivityModel;
