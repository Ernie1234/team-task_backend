import { ErrorCodeEnum } from "@/enums/errorCode.enum";
import { Roles } from "@/enums/role-enum";
import ActivityModel from "@/models/activity-model";
import MemberModel from "@/models/member-model";
import { NotificationTypeEnum } from "@/models/notification-model";
import { notifyUsers } from "@/services/notification-service";
import { forgetMemberships } from "@/utils/membership-cache";
import RoleModel from "@/models/role-model";
import UserModel from "@/models/user-model";
import WorkspaceModel from "@/models/workspace-model";
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@/utils/appError";

export const getMemberRoleInWorkspace = async (
  userId: string,
  workspaceId: string
) => {
  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) throw new NotFoundException("Workspace not found!");

  const member = await MemberModel.findOne({
    userId,
    workspaceId,
  }).populate("role");

  if (!member)
    throw new UnauthorizedException(
      "You are not a member of this workspace",
      ErrorCodeEnum.ACCESS_UNAUTHORIZED
    );

  const roleName = member.role?.name;

  return { role: roleName };
};
export const joinWorkspaceByInvite = async (
  userId: string,
  inviteCode: string
) => {
  const workspace = await WorkspaceModel.findOne({ inviteCode }).exec();
  if (!workspace)
    throw new NotFoundException(
      "Invite code not found or Workspace not found!"
    );

  const existingMember = await MemberModel.findOne({
    userId,
    workspaceId: workspace._id,
  }).exec();
  if (existingMember)
    throw new BadRequestException("Already a member of this workspace");

  const role = await RoleModel.findOne({ name: Roles.MEMBER });
  if (!role) throw new NotFoundException("Role not found!");

  const newMember = new MemberModel({
    userId,
    workspaceId: workspace._id,
    role: role._id,
  });
  await newMember.save();
  forgetMemberships(String(userId));

  const user = await UserModel.findById(userId);

  // Notify the existing members of the new join, and welcome the new member
  const membersInWorkspace = await MemberModel.find({
    workspaceId: workspace._id,
    userId: { $ne: userId },
  });
  await notifyUsers([
    ...membersInWorkspace.map((member) => ({
      sender: userId,
      recipient: member.userId,
      workspaceId: String(workspace._id),
      type: NotificationTypeEnum.MEMBER_JOINED,
      message: `${user?.name || "A new user"} has joined the workspace!`,
      link: `/workspace/${workspace._id}/members`,
    })),
    {
      sender: userId,
      recipient: userId,
      workspaceId: String(workspace._id),
      type: NotificationTypeEnum.WELCOME,
      message: `Welcome to the ${workspace.name} workspace!`,
      link: `/workspace/${workspace._id}`,
    },
  ]);

  const activity = new ActivityModel({
    user: userId,
    workspaceId: workspace._id,
    message: `\"${user?.name || "A new user"}\" has joined the workspace!`,
  });
  await activity.save();

  return { workspaceId: workspace._id, role: role.name };
};
