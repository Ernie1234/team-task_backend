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
import { NotificationTypeEnum } from "@/models/notification-model";
import { notifyUsers } from "@/services/notification-service";
import { forgetMemberships } from "@/utils/membership-cache";
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
  forgetMemberships(String(userId));
  user.currentWorkspace = workspace._id as mongoose.Types.ObjectId;
  await user.save();

  // Create an activity log for the new workspace
  const activity = new ActivityModel({
    user: userId,
    workspaceId: workspace._id,
    message: `\"${user.name}\" created the workspace \"${workspace.name}\"`,
  });
  await activity.save();

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
  const activities = await ActivityModel.find({
    workspaceId: workspaceId,
  })
    .populate("user", "name email profilePicture -password")
    .sort({ createdAt: -1 });

  const workspaceWithMembers = {
    ...workspace?.toObject(),
    members,
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
/**
 * Everything the dashboard shows, in one round of parallel queries:
 * headline counts, status/priority breakdown, completions per day for the
 * last 14 days, the signed-in user's open tasks, and each member's workload.
 */
// Days are counted in the server's time zone, on both the database and JS side
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const TIMEZONE = !zone || zone === "UTC" || zone === "Etc/UTC" ? "+00:00" : zone;
const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const getWorkspaceDashboardService = async (workspaceId: string, userId: string) => {
  const ws = new mongoose.Types.ObjectId(workspaceId);
  const me = new mongoose.Types.ObjectId(userId);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7)); // Monday
  const trendStart = new Date(startOfToday);
  trendStart.setDate(trendStart.getDate() - 13);

  const open = { $ne: TaskStatusEnum.DONE };

  const [byStatus, byPriority, overdue, dueToday, completedThisWeek, trend, myTasks, workload, members] =
    await Promise.all([
      TaskModel.aggregate([{ $match: { workspace: ws } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      TaskModel.aggregate([
        { $match: { workspace: ws, status: open } },
        { $group: { _id: "$priority", count: { $sum: 1 } } },
      ]),
      TaskModel.countDocuments({ workspace: ws, status: open, dueDate: { $lt: startOfToday } }),
      TaskModel.countDocuments({ workspace: ws, status: open, dueDate: { $gte: startOfToday, $lt: endOfToday } }),
      TaskModel.countDocuments({
        workspace: ws,
        status: TaskStatusEnum.DONE,
        $or: [{ completedAt: { $gte: startOfWeek } }, { completedAt: null, updatedAt: { $gte: startOfWeek } }],
      }),
      // Tasks finished before completedAt existed fall back to their last update
      TaskModel.aggregate([
        { $match: { workspace: ws, status: TaskStatusEnum.DONE } },
        { $addFields: { doneAt: { $ifNull: ["$completedAt", "$updatedAt"] } } },
        { $match: { doneAt: { $gte: trendStart } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$doneAt", timezone: TIMEZONE } }, count: { $sum: 1 } } },
      ]),
      TaskModel.find({ workspace: ws, assignedTo: me, status: open })
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(30)
        .populate([
          { path: "project", select: "name emoji" },
          { path: "parentTask", select: "title" },
        ])
        .lean(),
      TaskModel.aggregate([
        { $match: { workspace: ws, status: open, assignedTo: { $ne: null } } },
        {
          $group: {
            _id: "$assignedTo",
            open: { $sum: 1 },
            overdue: {
              $sum: { $cond: [{ $and: [{ $ne: ["$dueDate", null] }, { $lt: ["$dueDate", startOfToday] }] }, 1, 0] },
            },
            inProgress: { $sum: { $cond: [{ $eq: ["$status", TaskStatusEnum.IN_PROGRESS] }, 1, 0] } },
          },
        },
      ]),
      MemberModel.find({ workspaceId: ws })
        .populate<{
          userId: { _id: mongoose.Types.ObjectId; name: string; profilePicture?: string | null; isOnline?: boolean } | null;
        }>("userId", "name profilePicture isOnline")
        .lean(),
    ]);

  const statusCounts: Record<string, number> = Object.fromEntries(
    Object.values(TaskStatusEnum).map((s) => [s, 0])
  );
  byStatus.forEach((row) => (statusCounts[row._id] = row.count));
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const done = statusCounts[TaskStatusEnum.DONE] ?? 0;

  const priorityCounts: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  byPriority.forEach((row) => (priorityCounts[row._id] = row.count));

  // One entry per day, including days with nothing completed
  const perDay = new Map(trend.map((row) => [row._id as string, row.count as number]));
  const completedByDay = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(trendStart);
    d.setDate(d.getDate() + i);
    const key = localDayKey(d);
    return { date: key, count: perDay.get(key) ?? 0 };
  });

  const loadByUser = new Map(workload.map((row) => [String(row._id), row]));
  const team = members
    .filter((m) => m.userId)
    .map((m) => {
      const load = loadByUser.get(String(m.userId!._id));
      return {
        _id: String(m.userId!._id),
        name: m.userId!.name,
        profilePicture: m.userId!.profilePicture ?? null,
        isOnline: !!m.userId!.isOnline,
        open: load?.open ?? 0,
        overdue: load?.overdue ?? 0,
        inProgress: load?.inProgress ?? 0,
      };
    })
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  return {
    dashboard: {
      totals: {
        total,
        open: total - done,
        done,
        inProgress: statusCounts[TaskStatusEnum.IN_PROGRESS] ?? 0,
        overdue,
        dueToday,
        completedThisWeek,
        completionRate: total ? Math.round((done / total) * 100) : 0,
      },
      byStatus: statusCounts,
      byPriority: priorityCounts,
      completedByDay,
      myTasks,
      team,
    },
  };
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
  userId,
}: {
  workspaceId: string;
  memberId: string;
  roleId: string;
  userId: string;
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

  const updatingUser = await UserModel.findById(userId).select("name");

  member.role = role;
  await member.save();

  // Create an activity log for changing a member's role
  const activity = new ActivityModel({
    user: userId,
    workspaceId,
    message: `\"${updatingUser?.name}\" changed the role of \"${
      (member.userId as any).name
    }\" to \"${role.name}\"`,
  });
  await activity.save();

  return {
    member,
  };
};
export const updateWorkspaceByIdService = async ({
  workspaceId,
  name,
  description,
  userId,
}: {
  workspaceId: string;
  name: string | undefined;
  description: string | undefined;
  userId: string;
}) => {
  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) throw new NotFoundException("Workspace not found!");

  const updatingUser = await UserModel.findById(userId).select("name");

  workspace.name = name || workspace.name;
  workspace.description = description || workspace.description;
  await workspace.save();

  // Create an activity log for updating the workspace
  const activity = new ActivityModel({
    user: userId,
    workspaceId,
    message: `\"${updatingUser?.name}\" updated the workspace details.`,
  });
  await activity.save();

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
    forgetMemberships();
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

  // Let the other members know who was invited
  const membersInWorkspace = await MemberModel.find({
    workspaceId,
    userId: { $ne: inviterId },
  });
  await notifyUsers(
    membersInWorkspace.map((member) => ({
      sender: inviterId,
      recipient: member.userId,
      workspaceId,
      type: NotificationTypeEnum.MEMBER_INVITED,
      message: `${inviter.name} invited ${emailToInvite} to join the workspace.`,
      link: `/workspace/${workspaceId}/members`,
    }))
  );

  const activity = new ActivityModel({
    user: inviterId,
    workspaceId,
    message: `An invitation has been sent by \"${inviter.name}\" to \"${emailToInvite}\" to join the workspace.`,
  });
  await activity.save();

  return { status: true, message: "Invitation sent successfully!" };
};
