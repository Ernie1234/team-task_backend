import { ProviderEnum } from "@/enums/account-provider-enum";
import { Roles } from "@/enums/role-enum";
import AccountModel from "@/models/account-model";
import MemberModel from "@/models/member-model";
import RoleModel from "@/models/role-model";
import UserModel from "@/models/user-model";
import WorkspaceModel from "@/models/workspace-model";
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@/utils/appError";
import Logger from "@/utils/logger";
import type { TRegisterUser } from "@/validation/auth-validation";
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

export const registerUserService = async (body: TRegisterUser) => {
  const { email, name, password } = body;
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const existingUser = await UserModel.findOne({ email }).session(session);
    if (existingUser) {
      Logger.info("Email already exist!");
      throw new BadRequestException("Invalid credentials!");
    }
    const user = new UserModel({
      email,
      name,
      password,
    });
    await user.save({ session });

    const account = new AccountModel({
      userId: user._id,
      provider: ProviderEnum.EMAIL,
      providerId: email,
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
    Logger.info("User Registered successfully: ", user);

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

export const verifyUserService = async ({
  email,
  password,
  provider = ProviderEnum.EMAIL,
}: {
  email: string;
  password: string;
  provider?: string;
}) => {
  const account = await AccountModel.findOne({ provider, providerId: email });
  if (!account) {
    throw new NotFoundException("Invalid email or password");
  }
  const user = await UserModel.findById(account.userId);
  Logger.info("User found from account: ", user);
  if (!user) {
    throw new NotFoundException("User not found for the given account!");
  }

  const isPasswordMatch = await user.comparePassword(password);
  if (!isPasswordMatch) {
    throw new UnauthorizedException("Invalid email or password");
  }

  return user.omitPassword();
};
