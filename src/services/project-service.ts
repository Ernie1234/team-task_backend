import { TaskStatusEnum } from "@/enums/task-enum";
import ProjectModel, { type ProjectDocument } from "@/models/project-model";
import TaskModel from "@/models/task-model";
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
  body: TUpdateProjectInput,
  projectId: string
): Promise<{ project: ProjectDocument }> => {
  const project = await ProjectModel.findOne({
    _id: projectId,
    workspace: body.workspace,
  });

  if (!project)
    throw new NotFoundException(
      "Project not found or does not belong to the specified workspace"
    );

  if (body.emoji) project.emoji = body.emoji;
  if (body.name) project.name = body.name;
  if (body.description) project.description = body.description;

  await project.save();

  return { project };
};

export const deleteProjectService = async ({
  projectId,
  workspaceId,
}: {
  workspaceId: string;
  projectId: string;
}): Promise<{ project: ProjectDocument }> => {
  const project = await ProjectModel.findOne({
    _id: projectId,
    workspace: workspaceId,
  });
  if (!project)
    throw new NotFoundException(
      "Project not found or does not belong to the specified workspace"
    );

  await TaskModel.deleteMany({
    project: project._id,
  });
  await project.deleteOne();

  return { project };
};
