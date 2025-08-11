import { Roles } from "@/enums/role-enum";
import AccountModel from "@/models/account-model";
import MemberModel from "@/models/member-model";
import RoleModel from "@/models/role-model";
import UserModel from "@/models/user-model";
import WorkspaceModel from "@/models/workspace-model";
import { NotFoundException } from "@/utils/appError";
import Logger from "@/utils/logger";
import mongoose from "mongoose";

export const loginOrCreateAccount = async (data: {
  provider: string;
  displayName: string;
  providerId: string;
  picture?: string;
  email?: string;
}) => {
  const { providerId, provider, displayName, picture, email } = data;

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    let user = await UserModel.findOne({ email }).session(session);
    if (!user) {
      user = new UserModel({
        email,
        name: displayName,
        profilePicture: picture || null,
      });
      await user.save({ session });

      const account = new AccountModel({
        userId: user._id,
        provider: provider,
        providerId: providerId,
      });
      await account.save({ session });

      const workspace = new WorkspaceModel({
        name: `${user.name} workspace`,
        description: `My first team Workspace`,
        owner: user._id,
      });
      await workspace.save({ session });

      const ownerRole = await RoleModel.findOne({
        name: Roles.OWNER,
      }).session(session);
      if (!ownerRole) {
        throw new NotFoundException("Owner role not found!");
      }
      const member = new MemberModel({
        userId: user._id,
        workspaceId: workspace._id,
        role: ownerRole._id,
        joinedAt: new Date(),
      });
      await member.save({
        session,
      });

      user.currentWorkspace = workspace._id as mongoose.Types.ObjectId;
      await user.save({ session });
    }
    await session.commitTransaction();
    session.endSession();
    return { user };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    Logger.error("An error occurred here: ", error);
    throw error;
  }
};
