import type { Store } from "express-session";
import mongoose from "mongoose";
import AccountModel from "@/models/account-model";
import CalendarConnectionModel from "@/models/calendar-connection-model";
import EventModel from "@/models/event-model";
import MemberModel from "@/models/member-model";
import NoteModel from "@/models/note-model";
import NotificationModel from "@/models/notification-model";
import TaskModel from "@/models/task-model";
import UserModel from "@/models/user-model";
import UserSessionModel from "@/models/user-session-model";
import WorkspaceModel from "@/models/workspace-model";
import { ProviderEnum } from "@/enums/account-provider-enum";
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
  const [user, accounts] = await Promise.all([
    UserModel.findById(userId).select("+password").lean(),
    AccountModel.find({ userId }).select("provider createdAt").lean(),
  ]);
  if (!user) throw new NotFoundException("User not found");
  return {
    account: {
      userId: String(user._id),
      name: user.name ?? "",
      email: user.email,
      profilePicture: user.profilePicture ?? null,
      hasPassword: !!user.password,
      providers: accounts.map((a) => a.provider),
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
export const changePasswordService = async (userId: string, currentPassword: string | undefined, newPassword: string) => {
  const user = await findUser(userId, true);
  if (user.password) {
    if (!currentPassword || !(await user.comparePassword(currentPassword))) {
      throw new UnauthorizedException("Your current password isn't right");
    }
    if (await user.comparePassword(newPassword)) throw new BadRequestException("Choose a password you haven't used here before");
  }
  user.password = newPassword; // hashed by the model's pre-save hook
  await user.save();

  // Lets people who signed up with Google also sign in with email + password
  const hasEmailLogin = await AccountModel.exists({ userId, provider: ProviderEnum.EMAIL });
  if (!hasEmailLogin) {
    await AccountModel.create({ userId, provider: ProviderEnum.EMAIL, providerId: user.email });
  }
  return { hasPassword: true };
};

/* ---------------------------------------------------------------- devices */

const describe = (ua: string) => {
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return { os, browser };
};

const storeHas = (store: Store, sid: string) =>
  new Promise<boolean>((resolve) => store.get(sid, (err, session) => resolve(!err && !!session)));
const storeDestroy = (store: Store, sid: string) => new Promise<void>((resolve) => store.destroy(sid, () => resolve()));

export const listSessionsService = async (userId: string, currentSid: string, store: Store) => {
  const records = await UserSessionModel.find({ user: userId }).select("+sessionId").sort({ lastActiveAt: -1 }).lean();
  const live = [];
  for (const record of records) {
    // Expired or signed out elsewhere: tidy up
    if (record.sessionId !== currentSid && !(await storeHas(store, record.sessionId))) {
      await UserSessionModel.deleteOne({ _id: record._id });
      continue;
    }
    live.push({
      _id: String(record._id),
      ...describe(record.userAgent),
      ip: record.ip,
      lastActiveAt: record.lastActiveAt,
      createdAt: record.createdAt,
      current: record.sessionId === currentSid,
    });
  }
  return { sessions: live };
};

const endSession = async (store: Store, sid: string) => {
  await storeDestroy(store, sid);
  getSocketService()?.disconnectSession(sid);
};

export const revokeSessionService = async (userId: string, sessionRecordId: string, currentSid: string, store: Store) => {
  if (!mongoose.isValidObjectId(sessionRecordId)) throw new NotFoundException("Device not found");
  const record = await UserSessionModel.findOne({ _id: sessionRecordId, user: userId }).select("+sessionId");
  if (!record) throw new NotFoundException("Device not found");
  if (record.sessionId === currentSid) throw new BadRequestException("Use Log out to sign out of this device");
  await endSession(store, record.sessionId);
  await UserSessionModel.deleteOne({ _id: record._id });
};

export const revokeOtherSessionsService = async (userId: string, currentSid: string, store: Store) => {
  const records = await UserSessionModel.find({ user: userId, sessionId: { $ne: currentSid } }).select("+sessionId");
  for (const record of records) await endSession(store, record.sessionId);
  await UserSessionModel.deleteMany({ user: userId, sessionId: { $ne: currentSid } });
  return { count: records.length };
};

/* ---------------------------------------------------------------- delete */

/**
 * Deletes the account. Workspaces you own with other members must be handed over
 * or emptied first. Your messages stay in conversations under "Deleted user".
 */
export const deleteAccountService = async (userId: string, confirmEmail: string, store: Store) => {
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

  const sessions = await UserSessionModel.find({ user: userId }).select("+sessionId");
  for (const s of sessions) await endSession(store, s.sessionId);
  await UserSessionModel.deleteMany({ user: userId });
};
