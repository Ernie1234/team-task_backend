import MemberModel from "@/models/member-model";
import UserModel from "@/models/user-model";
import { BadRequestException } from "@/utils/appError";
import Logger from "@/utils/logger";
import type { AppearanceType, TourType } from "@/validation/user-validation";

export const fetchCurrentUser = async (userId: string) => {
  // Fetch the user and their memberships together (one round trip, not three)
  const [user, memberships] = await Promise.all([
    UserModel.findById(userId).select("-password").populate("currentWorkspace"),
    MemberModel.find({ userId }).select("workspaceId").sort({ joinedAt: 1 }).lean(),
  ]);

  if (!user) throw new BadRequestException("User not Found!");

  // currentWorkspace can point at a workspace the user was removed from (or
  // whose membership was never created). Sending them there makes every
  // workspace request fail, so fall back to a workspace they do belong to.
  const memberOf = new Set(memberships.map((m) => String(m.workspaceId)));
  const currentId = user.currentWorkspace ? String(user.currentWorkspace._id ?? user.currentWorkspace) : null;

  if (!currentId || !memberOf.has(currentId)) {
    const fallback = memberships[0]?.workspaceId ?? null;
    if (String(fallback) !== String(currentId)) {
      Logger.warn(
        `User ${userId} is not a member of current workspace ${currentId}; switching to ${fallback}`
      );
      user.currentWorkspace = fallback;
      await user.save();
      await user.populate("currentWorkspace");
    }
  }

  return { user };
};

export const updateAppearanceService = async (userId: string, appearance: AppearanceType) => {
  const result = await UserModel.updateOne({ _id: userId }, { $set: { appearance } });
  if (!result.matchedCount) throw new BadRequestException("User not Found!");
  return { appearance };
};

export const updateTourService = async (userId: string, { status }: TourType) => {
  const tour = { status, updatedAt: new Date() };
  const result = await UserModel.updateOne({ _id: userId }, { $set: { tour } });
  if (!result.matchedCount) throw new BadRequestException("User not Found!");
  return { tour };
};
