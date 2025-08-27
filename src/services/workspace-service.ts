import { Roles } from "@/enums/role-enum";
import { TaskStatusEnum } from "@/enums/task-enum";
import MemberModel from "@/models/member-model";
import RoleModel from "@/models/role-model";
import TaskModel from "@/models/task-model";
import UserModel from "@/models/user-model";
import WorkspaceModel from "@/models/workspace-model";
import { NotFoundException } from "@/utils/appError";
import type mongoose from "mongoose";

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
  const workspaceWithMembers = {
    ...workspace?.toObject(),
    members,
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
