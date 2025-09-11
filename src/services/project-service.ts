import { TaskStatusEnum } from "@/enums/task-enum";
import ActivityModel from "@/models/activity-model";
import ProjectModel, { type ProjectDocument } from "@/models/project-model";
import TaskModel from "@/models/task-model";
import UserModel from "@/models/user-model";
import { NotFoundException } from "@/utils/appError";
import type {
  TCreateProjectInput,
  TUpdateProjectInput,
} from "@/validation/project-validation";
import mongoose from "mongoose";

export const createProjectService = async (
  body: TCreateProjectInput
): Promise<{ project: ProjectDocument }> => {
  const project = new ProjectModel({
    ...body,
    workspace: new mongoose.Types.ObjectId(body.workspace),
    createdBy: new mongoose.Types.ObjectId(body.createdBy),
  });

  await project.save();

  const user = await UserModel.findById(body.createdBy).select("name");

  // Create an activity log for creating a project
  const activity = new ActivityModel({
    user: body.createdBy,
    workspaceId: body.workspace,
    message: `\"${user?.name}\" created the project \"${project.name}\"`,
  });
  await activity.save();

  return { project };
};
export const getProjectsInWorkspaceService = async ({
  workspaceId,
  pageNumber,
  pageSize,
}: {
  workspaceId: string;
  pageSize: number;
  pageNumber: number;
}) => {
  const totalCount = await ProjectModel.countDocuments({
    workspace: workspaceId,
  });

  const skip = (pageNumber - 1) * pageSize;
  const projects = await ProjectModel.find({
    workspace: workspaceId,
  })
    .skip(skip)
    .limit(pageSize)
    .populate("createdBy", "_id name profilePicture -password")
    .sort({ createdAt: -1 });

  const totalPages = Math.ceil(totalCount / pageSize);

  return { projects, totalCount, totalPages, skip };
};
export const getProjectByIdInWorkspaceService = async ({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) => {
  const project = await ProjectModel.findOne({
    workspace: workspaceId,
    _id: projectId,
  }).select("_id name description emoji");

  if (!project)
    throw new NotFoundException(
      "Project not found or does not belong to the specified workspace"
    );

  return { project };
};
export const getProjectAnalyticsWorkspaceService = async ({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) => {
  const project = await ProjectModel.findById(projectId);

  if (!project)
    throw new NotFoundException(
      "Project not found or does not belong to the specified workspace"
    );

  const currentDate = new Date();
  const taskAnalytics = await TaskModel.aggregate([
    {
      $match: {
        project: new mongoose.Types.ObjectId(projectId),
      },
    },
    {
      $facet: {
        totalTasks: [{ $count: "count" }],
        overdueTasks: [
          {
            $match: {
              dueDate: { $lt: currentDate },
              status: {
                $ne: TaskStatusEnum.DONE,
              },
            },
          },
          {
            $count: "count",
          },
        ],
        completedTasks: [
          { $match: { status: TaskStatusEnum.DONE } },
          { $count: "count" },
        ],
      },
    },
  ]);

  const _analytics = taskAnalytics[0];
  const analytics = {
    totalTasks: _analytics.totalTasks[0]?.count || 0,
    overdueTasks: _analytics.overdueTasks[0]?.count || 0,
    completedTasks: _analytics.completedTasks[0]?.count || 0,
  };

  return { analytics };
};
export const updateProjectService = async (
  validatedData: TUpdateProjectInput,
  projectId: string
): Promise<{ project: ProjectDocument }> => {
  const project = await ProjectModel.findOne({
    _id: projectId,
    workspace: validatedData.workspace,
  });

  if (!project)
    throw new NotFoundException(
      "Project not found or does not belong to the specified workspace"
    );

  if (validatedData.emoji) project.emoji = validatedData.emoji;
  if (validatedData.name) project.name = validatedData.name;
  if (validatedData.description)
    project.description = validatedData.description;

  await project.save();

  const updatingUser = await UserModel.findById(validatedData.createdBy).select(
    "name"
  );

  // Create an activity log for updating a project
  const activity = new ActivityModel({
    user: validatedData.createdBy,
    workspaceId: validatedData.workspace,
    message: `\"${updatingUser?.name}\" updated the project \"${project.name}\"`,
  });
  await activity.save();

  return { project };
};

export const deleteProjectService = async ({
  projectId,
  workspaceId,
  userId,
}: {
  workspaceId: string;
  projectId: string;
  userId: string;
}): Promise<{ project: ProjectDocument }> => {
  const project = await ProjectModel.findOne({
    _id: projectId,
    workspace: workspaceId,
  });
  if (!project)
    throw new NotFoundException(
      "Project not found or does not belong to the specified workspace"
    );

  const deletingUser = await UserModel.findById(userId).select("name");

  await TaskModel.deleteMany({
    project: project._id,
  });
  await project.deleteOne();

  // Create an activity log for deleting a project
  const activity = new ActivityModel({
    user: userId,
    workspaceId,
    message: `\"${deletingUser?.name}\" deleted the project \"${project.name}\"`,
  });
  await activity.save();

  return { project };
};
