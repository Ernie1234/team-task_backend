import { Types } from "mongoose";
import NotificationModel, {
  NotificationTypeEnum,
  type NotificationType,
} from "@/models/notification-model";
import { getSocketService } from "@/config/socket.config";
import Logger from "@/utils/logger";

type Id = string | Types.ObjectId;

export type CreateNotificationInput = {
  recipient: Id;
  sender: Id;
  workspaceId: Id;
  message: string;
  link?: string;
  type?: NotificationType;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A user's notifications for one workspace. Notifications created before
 * `workspaceId` existed on the model only carry the workspace id in their link.
 */
export const workspaceNotificationFilter = (userId: Id, workspaceId: string) => ({
  recipient: new Types.ObjectId(String(userId)),
  $or: [
    { workspaceId: new Types.ObjectId(workspaceId) },
    {
      workspaceId: { $exists: false },
      link: { $regex: escapeRegex(workspaceId) },
    },
  ],
});

/**
 * Save notifications and push each one to its recipient's open tabs.
 * Notifications are a side effect: a failure here is logged, never thrown,
 * so it can't break the action that triggered it.
 */
export const notifyUsers = async (inputs: CreateNotificationInput[]) => {
  if (inputs.length === 0) return [];

  try {
    const created = await NotificationModel.insertMany(
      inputs.map((input) => ({
        ...input,
        type: input.type ?? NotificationTypeEnum.GENERAL,
        isRead: false,
        emailed: false, // the email job decides whether it's worth an email
      }))
    );

    const populated = await NotificationModel.populate(created, {
      path: "sender",
      select: "name email profilePicture",
    });

    const socketService = getSocketService();
    populated.forEach((notification) => {
      socketService?.emitToUser(String(notification.recipient), "notification:new", {
        notification: notification.toObject(),
      });
    });

    return populated;
  } catch (error) {
    Logger.error("Failed to create notifications:", error);
    return [];
  }
};

export const getWorkspaceNotificationsService = async (
  userId: Id,
  workspaceId: string,
  limit = 100
) => {
  const filter = workspaceNotificationFilter(userId, workspaceId);

  const [notifications, unreadCount] = await Promise.all([
    NotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("sender", "name email profilePicture"),
    NotificationModel.countDocuments({ ...filter, isRead: false }),
  ]);

  return { notifications, unreadCount };
};

export const markNotificationsAsReadService = async (
  userId: Id,
  notificationIds: string[]
) => {
  const ids = notificationIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  const result = await NotificationModel.updateMany(
    { _id: { $in: ids }, recipient: new Types.ObjectId(String(userId)), isRead: false },
    { $set: { isRead: true } }
  );

  // Keep the user's other tabs in sync
  if (result.modifiedCount > 0) {
    getSocketService()?.emitToUser(String(userId), "notification:read", {
      notificationIds: ids.map(String),
    });
  }

  return { modifiedCount: result.modifiedCount };
};

export const markAllNotificationsAsReadService = async (
  userId: Id,
  workspaceId: string
) => {
  const result = await NotificationModel.updateMany(
    { ...workspaceNotificationFilter(userId, workspaceId), isRead: false },
    { $set: { isRead: true } }
  );

  if (result.modifiedCount > 0) {
    getSocketService()?.emitToUser(String(userId), "notification:read", {
      workspaceId,
      all: true,
    });
  }

  return { modifiedCount: result.modifiedCount };
};
