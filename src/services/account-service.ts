import mongoose from "mongoose";
import AccountModel from "@/models/account-model";
import { AuthAccountModel, AuthSessionModel } from "@/models/auth-models";
import { auth } from "@/config/auth";
import { APIError } from "better-auth/api";
import CalendarConnectionModel from "@/models/calendar-connection-model";
import EventModel from "@/models/event-model";
import MemberModel from "@/models/member-model";
import NoteModel from "@/models/note-model";
import NotificationModel from "@/models/notification-model";
import TaskModel from "@/models/task-model";
import UserModel from "@/models/user-model";
import WorkspaceModel from "@/models/workspace-model";
import { getSocketService } from "@/config/socket.config";
import { disconnectService } from "@/services/calendar-service";
import { deleteWorkspaceByIdService } from "@/services/workspace-service";
import { forgetMemberships } from "@/utils/membership-cache";
import { BadRequestException, NotFoundException, UnauthorizedException } from "@/utils/appError";
import type { UpdateProfileType } from "@/validation/user-validation";

const findUser = async (userId: string, withPassword = false) => {
  const user = await UserModel.findById(userId).select(withPassword ? "+password" : "-password");
  if (!user || user.isActive === false) throw new NotFoundException("User not found");
  return user;
};

/** What the Account page shows */
export const getAccountService = async (userId: string) => {
  const [user, logins] = await Promise.all([
    UserModel.findById(userId).lean(),
    AuthAccountModel.find({ userId: new mongoose.Types.ObjectId(userId) }).select("providerId").lean(),
  ]);
  if (!user) throw new NotFoundException("User not found");
  return {
    account: {
      userId: String(user._id),
      name: user.name ?? "",
      email: user.email,
      profilePicture: user.profilePicture ?? null,
      hasPassword: logins.some((l) => l.providerId === "credential"),
      providers: logins.map((l) => (l.providerId === "credential" ? "EMAIL" : l.providerId.toUpperCase())),
      createdAt: user.createdAt,
    },
  };
};

export const updateProfileService = async (userId: string, data: UpdateProfileType) => {
  const user = await findUser(userId);
  if (data.name !== undefined) user.name = data.name;
  if (data.profilePicture !== undefined) user.profilePicture = data.profilePicture;
  await user.save();
  return { user: user.omitPassword() };
};

/** Set a password (Google-only accounts) or change it (needs the current one) */
export const changePasswordService = async (userId: string, headers: Headers, currentPassword: string | undefined, newPassword: string) => {
  const hasPassword = !!(await AuthAccountModel.exists({ userId: new mongoose.Types.ObjectId(userId), providerId: "credential" }));
  try {
    if (hasPassword) {
      if (!currentPassword) throw new UnauthorizedException("Enter your current password");
      await auth.api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions: false }, headers });
    } else {
      // Google-only account: add email + password sign-in
      await auth.api.setPassword({ body: { newPassword }, headers });
    }
  } catch (error) {
    if (error instanceof APIError) {
      const message = String(error.body?.message ?? error.message ?? "");
      if (/invalid password/i.test(message)) throw new UnauthorizedException("Your current password isn't right");
      throw new BadRequestException(message || "Couldn't save your password");
    }
    throw error;
  }
  return { hasPassword: true };
};

/* ---------------------------------------------------------------- devices */

const describe = (ua: string) => {
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return { os, browser };
};

/** Signed-in devices = live Better Auth sessions */
export const listSessionsService = async (userId: string, currentSessionId: string | undefined) => {
  const sessions = await AuthSessionModel.find({ userId: new mongoose.Types.ObjectId(userId), expiresAt: { $gt: new Date() } })
    .sort({ updatedAt: -1 })
    .lean();
  return {
    sessions: sessions.map((s) => ({
      _id: String(s._id),
      ...describe(s.userAgent ?? ""),
      ip: s.ipAddress ?? "",
      lastActiveAt: s.updatedAt ?? s.createdAt,
      createdAt: s.createdAt,
      current: String(s._id) === currentSessionId,
    })),
  };
};

const endSessions = async (sessionIds: string[]) => {
  if (!sessionIds.length) return;
  await AuthSessionModel.deleteMany({ _id: { $in: sessionIds.map((id) => new mongoose.Types.ObjectId(id)) } });
  // Their open tabs drop off straight away; their cached sign-in expires within 2 minutes
  sessionIds.forEach((id) => getSocketService()?.disconnectSession(id));
};

export const revokeSessionService = async (userId: string, sessionId: string, currentSessionId: string | undefined) => {
  if (!mongoose.isValidObjectId(sessionId)) throw new NotFoundException("Device not found");
  if (sessionId === currentSessionId) throw new BadRequestException("Use Log out to sign out of this device");
  const session = await AuthSessionModel.findOne({ _id: sessionId, userId: new mongoose.Types.ObjectId(userId) }).select("_id").lean();
  if (!session) throw new NotFoundException("Device not found");
  await endSessions([String(session._id)]);
};

export const revokeOtherSessionsService = async (userId: string, currentSessionId: string | undefined) => {
  const others = await AuthSessionModel.find({ userId: new mongoose.Types.ObjectId(userId) }).select("_id").lean();
  const ids = others.map((s) => String(s._id)).filter((id) => id !== currentSessionId);
  await endSessions(ids);
  return { count: ids.length };
};

/* ---------------------------------------------------------------- delete */

/**
 * Deletes the account. Workspaces you own with other members must be handed over
 * or emptied first. Your messages stay in conversations under "Deleted user".
 */
export const deleteAccountService = async (userId: string, confirmEmail: string, currentSessionId: string | undefined) => {
  const user = await findUser(userId);
  if (user.email.toLowerCase() !== confirmEmail) throw new BadRequestException("Type your email exactly to confirm");

  const owned = await WorkspaceModel.find({ owner: userId }).select("name").lean();
  const shared = [];
  for (const ws of owned) {
    const others = await MemberModel.countDocuments({ workspaceId: ws._id, userId: { $ne: userId } });
    if (others > 0) shared.push(ws.name);
  }
  if (shared.length) {
    throw new BadRequestException(
      `You own ${shared.map((n) => `"${n}"`).join(", ")} with other members. Remove the members or delete ${shared.length === 1 ? "that workspace" : "those workspaces"} first.`
    );
  }

  // Workspaces only you are in
  for (const ws of owned) await deleteWorkspaceByIdService({ workspaceId: String(ws._id), userId });

  await disconnectService(userId).catch(() => undefined);
  await Promise.all([
    CalendarConnectionModel.deleteMany({ user: userId }),
    EventModel.deleteMany({ user: userId }),
    NoteModel.deleteMany({ createdBy: userId, visibility: "private" }),
    NotificationModel.deleteMany({ recipient: userId }),
    TaskModel.updateMany({ assignedTo: userId }, { $set: { assignedTo: null } }),
    MemberModel.deleteMany({ userId }),
    AccountModel.deleteMany({ userId }),
    AuthAccountModel.deleteMany({ userId: new mongoose.Types.ObjectId(userId) }),
  ]);
  forgetMemberships(userId);

  // Keep the record so old messages and shared pages still have an author
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        name: "Deleted user",
        email: `deleted-${userId}@deleted.invalid`,
        profilePicture: null,
        isActive: false,
        isOnline: false,
        currentWorkspace: null,
        appearance: null,
      },
      $unset: { password: 1, verificationToken: 1, verificationTokenExpiresAt: 1 },
    }
  );

  // Sign out every other device; the caller signs this one out (clears its cookie)
  const others = await AuthSessionModel.find({ userId: new mongoose.Types.ObjectId(userId) }).select("_id").lean();
  await endSessions(others.map((s) => String(s._id)).filter((id) => id !== currentSessionId));
};
