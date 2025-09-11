import mongoose from "mongoose";

import { Roles } from "@/enums/role-enum";
import { TaskStatusEnum } from "@/enums/task-enum";
import MemberModel from "@/models/member-model";
import RoleModel from "@/models/role-model";
import TaskModel from "@/models/task-model";
import UserModel from "@/models/user-model";
import WorkspaceModel from "@/models/workspace-model";
import { BadRequestException, NotFoundException } from "@/utils/appError";
import ProjectModel from "@/models/project-model";
import Logger from "@/utils/logger";
import NotificationModel from "@/models/notification-model";
import ActivityModel from "@/models/activity-model";
import { sendWorkspaceInvitationEmail } from "@/mails/emails";
import { config } from "@/config/app.config";

const baseUrl = config.FRONTEND_ORIGIN;

export const createWorkspaceService = async (
  userId: string,
  body: {
    name: string;
    description?: string | undefined;
  }
) => {
  const { name, description } = body;
  const user = await UserModel.findById(userId);
  if (!user) throw new NotFoundException("User not found");
  const ownerRole = await RoleModel.findOne({ name: Roles.OWNER });
  if (!ownerRole) throw new NotFoundException("Owner role not found!");
  const workspace = new WorkspaceModel({
    name,
    description,
    owner: user._id,
  });

  await workspace.save();
  const member = new MemberModel({
    userId: user._id,
    workspaceId: workspace._id,
    role: ownerRole._id,
    joinedAt: new Date(),
  });
  await member.save();
  user.currentWorkspace = workspace._id as mongoose.Types.ObjectId;
  await user.save();
  return {
    workspace,
  };
};
export const getUserWorkspacesIsMemberService = async (userId: string) => {
  const membership = await MemberModel.find({ userId })
    .populate("workspaceId")
    .select("-password")
    .exec();

  const workspaces = membership.map((member) => member.workspaceId);

  return { workspaces };
};
export const getWorkspaceByIdService = async (workspaceId: string) => {
  const workspace = await WorkspaceModel.findById(workspaceId);
  const members = await MemberModel.find({ workspaceId }).populate("role");
  const notifications = await NotificationModel.find({
    $or: [
      { workspaceId: workspaceId },
      { link: { $regex: `^/workspaces/${workspaceId}/`, $options: "i" } },
    ],
  })
    .populate("sender", "name email profilePicture -password")
    .populate("recipient", "name email profilePicture -password")
    .sort({ createdAt: -1 });
  const activities = await ActivityModel.find({
    workspaceId: workspaceId,
  })
    .populate("user", "name email profilePicture -password")
    .sort({ createdAt: -1 });

  const workspaceWithMembers = {
    ...workspace?.toObject(),
    members,
    notifications,
    activities,
  };

  return { workspaceWithMembers };
};
export const getWorkspaceMembersService = async (workspaceId: string) => {
  const members = await MemberModel.find({
    workspaceId,
  })
    .populate("userId", "name email profilePicture -password")
    .populate("role", "name");

  const roles = await RoleModel.find({}, { name: 1, _id: 1 })
    .select("-permission")
    .lean();

  return { members, roles };
};
export const getWorkspaceAnalyticsService = async (workspaceId: string) => {
  const currentDate = new Date();
  const totalTasks = await TaskModel.countDocuments({
    workspace: workspaceId,
  });

  const overdueTasks = await TaskModel.countDocuments({
    workspace: workspaceId,
    dueDate: { $lt: currentDate },
    status: { $ne: TaskStatusEnum.DONE },
  });
  const completedTasks = await TaskModel.countDocuments({
    workspace: workspaceId,
    status: TaskStatusEnum.DONE,
  });
  const analytics = {
    totalTasks,
    overdueTasks,
    completedTasks,
  };

  return { analytics };
};
export const changeMemberRoleService = async ({
  workspaceId,
  memberId,
  roleId,
}: {
  workspaceId: string;
  memberId: string;
  roleId: string;
}) => {
  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) throw new NotFoundException("Workspace not found!");
  const role = await RoleModel.findById(roleId);
  if (!role) throw new NotFoundException("Role not found!");

  const member = await MemberModel.findOne({
    userId: memberId,
    workspaceId: workspaceId,
  });
  if (!member) throw new NotFoundException("Member not found in the workspace");

  member.role = role;

  await member.save();

  return {
    member,
  };
};
export const updateWorkspaceByIdService = async ({
  workspaceId,
  name,
  description,
}: {
  workspaceId: string;
  name: string | undefined;
  description: string | undefined;
}) => {
  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) throw new NotFoundException("Workspace not found!");

  workspace.name = name || workspace.name;
  workspace.description = description || workspace.description;
  await workspace.save();

  return {
    workspace,
  };
};
export const deleteWorkspaceByIdService = async ({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const workspace = await WorkspaceModel.findById(workspaceId).session(
      session
    );
    if (!workspace) throw new NotFoundException("Workspace not found!");

    if (workspace.owner.toString() !== userId)
      throw new BadRequestException(
        "You are not authorized to delete this Workspace"
      );
    const user = await UserModel.findById(userId).session(session);
    if (!user) throw new NotFoundException("User not found!");

    await ProjectModel.deleteMany({ workspace: workspace._id }).session(
      session
    );
    await TaskModel.deleteMany({ workspace: workspace._id }).session(session);
    await MemberModel.deleteMany({ workspaceId: workspace._id }).session(
      session
    );

    if (user?.currentWorkspace?.equals(workspaceId)) {
      const memberWorkspace = await MemberModel.findOne({ userId }).session(
        session
      );
      user.currentWorkspace = memberWorkspace
        ? memberWorkspace.workspaceId
        : null;

      await user.save({ session });
    }

    await workspace.deleteOne({ session });
    await session.commitTransaction();

    session.endSession();
    return { currentWorkspace: user.currentWorkspace };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    Logger.error("An error occurred here: ", error);
    throw error;
  }
};
export const inviteMemberByEmailService = async ({
  inviterId,
  workspaceId,
  emailToInvite,
}: {
  inviterId: string;
  workspaceId: string;
  emailToInvite: string;
}) => {
  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) throw new NotFoundException("Workspace not found!");
  const inviter = await UserModel.findById(inviterId);
  if (!inviter) throw new NotFoundException("Inviter not found!");

  // Check if a user with that email already exists and is a member.
  const invitedUser = await UserModel.findOne({ email: emailToInvite });
  if (invitedUser) {
    const isMember = await MemberModel.findOne({
      userId: invitedUser._id,
      workspaceId,
    });
    if (isMember) {
      throw new BadRequestException("User is already a member!");
    }
  }

  const inviteURL = `${baseUrl}/invite/workspace/${workspace.inviteCode}/join`;

  await sendWorkspaceInvitationEmail(
    emailToInvite,
    inviter.name,
    workspace.name,
    inviteURL
  );

  // Get all members of the workspace to send notifications to everyone
  const membersInWorkspace = await MemberModel.find({ workspaceId });
  const notificationPromises = membersInWorkspace.map((member) => {
    return NotificationModel.create({
      sender: inviterId,
      recipient: member.userId,
      workspaceId,
      message: `An invitation has been sent by ${inviter.name} to ${emailToInvite} to join the workspace.`,
      link: `/workspaces/${workspaceId}`,
    });
  });
  await Promise.all(notificationPromises);

  const activity = new ActivityModel({
    user: inviterId,
    workspaceId,
    message: `An invitation has been sent by \"${inviter.name}\" to \"${emailToInvite}\" to join the workspace.`,
  });
  await activity.save();

  return { status: true, message: "Invitation sent successfully!" };
};
