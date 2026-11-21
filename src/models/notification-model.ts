import mongoose, { Schema, Document } from "mongoose";

export const NotificationTypeEnum = {
  TASK_ASSIGNED: "TASK_ASSIGNED",
  TASK_UPDATED: "TASK_UPDATED",
  MEMBER_JOINED: "MEMBER_JOINED",
  MEMBER_INVITED: "MEMBER_INVITED",
  WELCOME: "WELCOME",
  GENERAL: "GENERAL",
  EVENT_REMINDER: "EVENT_REMINDER",
} as const;

export type NotificationType =
  (typeof NotificationTypeEnum)[keyof typeof NotificationTypeEnum];

export interface NotificationDocument extends Document {
  recipient: mongoose.Types.ObjectId | string;
  sender: mongoose.Types.ObjectId | string;
  // Older notifications were saved without this; see workspaceNotificationFilter
  workspaceId?: mongoose.Types.ObjectId | string;
  type: NotificationType;
  message: string;
  link: string;
  isRead: boolean;
  /** false = waiting for the email job; unset on notifications from before email existed */
  emailed?: boolean;
  /** Which run of the email job picked it up */
  emailBatch?: string;
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
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
    },
    type: {
      type: String,
      enum: Object.values(NotificationTypeEnum),
      default: NotificationTypeEnum.GENERAL,
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
    emailed: { type: Boolean },
    emailBatch: { type: String },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Main query: a user's notifications in one workspace, newest first
notificationSchema.index({ recipient: 1, workspaceId: 1, createdAt: -1 });

// The email job only looks at notifications still waiting to be emailed
notificationSchema.index({ createdAt: 1 }, { partialFilterExpression: { emailed: false }, name: "email_queue" });

const NotificationModel = mongoose.model<NotificationDocument>(
  "Notification",
  notificationSchema
);
export default NotificationModel;
