import mongoose from "mongoose";
import { ProviderEnum } from "@/enums/account-provider-enum";
import { Roles } from "@/enums/role-enum";
import AccountModel from "@/models/account-model";
import { AuthAccountModel } from "@/models/auth-models";
import MemberModel from "@/models/member-model";
import RoleModel from "@/models/role-model";
import UserModel from "@/models/user-model";
import WorkspaceModel from "@/models/workspace-model";
import Logger from "@/utils/logger";

/**
 * A new account (email sign-up or first Google sign-in) gets its own workspace
 * with the user as Owner. Called by Better Auth after it creates the user.
 */
export const provisionNewUser = async (userId: string, name: string) => {
  const user = await UserModel.findById(userId).select("currentWorkspace");
  if (!user || user.currentWorkspace) return;

  const ownerRole = await RoleModel.findOne({ name: Roles.OWNER }).select("_id").lean();
  if (!ownerRole) {
    Logger.error("Owner role not found. Run `bun run seed` to create the default roles.");
    return;
  }

  const workspace = await WorkspaceModel.create({
    name: `${name || "My"} workspace`,
    description: "My first team workspace",
    owner: user._id,
  });
  await MemberModel.create({ userId: user._id, workspaceId: workspace._id, role: ownerRole._id, joinedAt: new Date() });
  await UserModel.updateOne(
    { _id: user._id },
    {
      $set: {
        currentWorkspace: workspace._id,
        isActive: true,
        isOnline: false,
        lastSeen: null,
        // New accounts get the guided tour on their first visit
        tour: { status: "pending", updatedAt: new Date() },
      },
    }
  );
};

/** Deleted accounts are kept as "Deleted user" with isActive=false and can't sign in */
export const isUserActive = async (userId: string) => {
  if (!mongoose.isValidObjectId(userId)) return false;
  const user = await UserModel.findById(userId).select("isActive").lean();
  return !!user && user.isActive !== false;
};

/**
 * One-time move of logins made before Better Auth (passport) into Better Auth's
 * accounts collection. Safe to run on every start: it only adds what's missing.
 * - email logins keep their bcrypt hash (Better Auth is configured to verify bcrypt)
 * - Google logins keep their Google account id
 */
export const migrateLegacyAuth = async () => {
  const legacy = await AccountModel.find({ provider: { $in: [ProviderEnum.EMAIL, ProviderEnum.GOOGLE] } })
    .select("userId provider providerId createdAt")
    .lean();
  if (!legacy.length) return { migrated: 0 };

  const users = new Map(
    (await UserModel.find({ _id: { $in: legacy.map((a) => a.userId) } }).select("+password").lean()).map((u) => [String(u._id), u])
  );

  const now = new Date();
  const ops = [];
  for (const account of legacy) {
    const user = users.get(String(account.userId));
    if (!user || user.isActive === false) continue;
    const isEmail = account.provider === ProviderEnum.EMAIL;
    if (isEmail && !user.password) continue;
    const providerId = isEmail ? "credential" : "google";
    ops.push({
      updateOne: {
        filter: { userId: user._id, providerId },
        update: {
          $setOnInsert: {
            userId: user._id,
            providerId,
            accountId: isEmail ? String(user._id) : account.providerId,
            ...(isEmail ? { password: user.password } : {}),
            createdAt: account.createdAt ?? now,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    });
  }
  if (!ops.length) return { migrated: 0 };
  const result = await AuthAccountModel.bulkWrite(ops, { ordered: false });
  if (result.upsertedCount) Logger.info(`🔐 Moved ${result.upsertedCount} existing login(s) to Better Auth`);
  return { migrated: result.upsertedCount };
};
