import mongoose, { Schema, Document } from "mongoose";

export interface NotificationDocument extends Document {
  recipient: mongoose.Types.ObjectId | string;
  sender: mongoose.Types.ObjectId | string;
  message: string;
  link: string;
  isRead: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<NotificationDocument>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    link: {
      type: String,
      required: false,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const NotificationModel = mongoose.model<NotificationDocument>(
  "Notification",
  notificationSchema
);
export default NotificationModel;
