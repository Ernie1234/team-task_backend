import { TaskPriorityEnum, TaskStatusEnum } from "@/enums/task-enum";
import type { ActivityDocument } from "@/models/activity-model";
import ActivityModel from "@/models/activity-model";
import MemberModel from "@/models/member-model";
import type { NotificationDocument } from "@/models/notification-model";
import NotificationModel, { NotificationTypeEnum } from "@/models/notification-model";
import { notifyUsers } from "@/services/notification-service";
import ProjectModel from "@/models/project-model";
import type { TaskDocument } from "@/models/task-model";
import TaskModel from "@/models/task-model";
import UserModel from "@/models/user-model";
import {
  AppError,
  BadRequestException,
  InternalServerException,
  NotFoundException,
} from "@/utils/appError";
import { getSocketService } from "@/config/socket.config";
import mongoose from "mongoose";

// Let everyone viewing the workspace refresh their task views
const emitTaskChanged = (
  workspaceId: string | mongoose.Types.ObjectId,
  payload: { action: "created" | "updated" | "deleted"; taskId: string; projectId: string; parentTask?: string | null }
) => {
  getSocketService()?.emitToRooms([`presence:${workspaceId}`], "task:changed", {
    workspaceId: String(workspaceId),
    ...payload,
  });
};

const TASK_POPULATE = [
  { path: "assignedTo", select: "name email profilePicture" },
  { path: "project", select: "name emoji" },
];

const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Adds subtaskCount / subtaskDoneCount to each task (one query for all). */
const withSubtaskCounts = async <T extends { _id: unknown }>(tasks: T[]) => {
  if (tasks.length === 0) return tasks.map((t) => ({ ...t, subtaskCount: 0, subtaskDoneCount: 0 }));
  const counts = await TaskModel.aggregate([
    { $match: { parentTask: { $in: tasks.map((t) => t._id) } } },
    {
      $group: {
        _id: "$parentTask",
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ["$status", TaskStatusEnum.DONE] }, 1, 0] } },
      },
    },
  ]);
  const byParent = new Map(counts.map((c) => [String(c._id), c]));
  return tasks.map((t) => ({
    ...t,
    subtaskCount: byParent.get(String(t._id))?.total ?? 0,
    subtaskDoneCount: byParent.get(String(t._id))?.done ?? 0,
  }));
};
import type {
  createTaskBodySchema,
  GetAllTasksQueryParams,
  GetAllTasksServiceFilters,
  taskParamsSchema,
  updateTaskBodySchema,
} from "@/validation/task-validation";
import type z from "zod";

type CreateTaskData = z.infer<typeof createTaskBodySchema> & {
  workspace: string;
  project: string;
  createdBy: string;
};

/**
 * Creates a new task in the database.
 * @param data - The validated task data including user and workspace/project IDs.
 * @returns An object containing the newly created task document.
 */
export const createTaskService = async (
  data: CreateTaskData
): Promise<{ task: TaskDocument }> => {
  try {
    const project = await ProjectModel.findById(data.project);
    if (!project || project.workspace.toString() !== data.workspace.toString())
      throw new NotFoundException(
        "Project not found or does not belong to this workspace"
      );

    // Subtasks live in the same project as their parent, one level deep
    let parentTitle: string | null = null;
    if (data.parentTask) {
      const parent = await TaskModel.findOne({
        _id: data.parentTask,
        workspace: data.workspace,
        project: data.project,
      }).select("title parentTask");
      if (!parent) throw new BadRequestException("Parent task not found in this project");
      if (parent.parentTask) throw new BadRequestException("Subtasks can't have their own subtasks");
      parentTitle = parent.title;
    }

    if (data.assignedTo) {
      const isAssigneduserMember = await MemberModel.exists({
        userId: data.assignedTo,
        workspaceId: data.workspace,
      });

      if (!isAssigneduserMember)
        throw new Error("Assigned user is not a member of this workspace");
    }

    const newTask = new TaskModel({
      title: data.title,
      description: data.description,
      status: data.status || TaskStatusEnum.TODO,
      priority: data.priority || TaskPriorityEnum.MEDIUM,
      assignedTo: data.assignedTo,
      dueDate: data.dueDate,
      workspace: data.workspace,
      project: data.project,
      createdBy: data.createdBy,
      parentTask: data.parentTask ?? null,
      completedAt: data.status === TaskStatusEnum.DONE ? new Date() : null,
    });

    const savedTask = await newTask.save();

    const creator = await UserModel.findById(data.createdBy).select("name");
    const creatorName = creator?.name || "Someone";
    let notificationMessage = `\"${creatorName}\" created the task \"${data.title}\".`;

    if (data.assignedTo) {
      notificationMessage = `\"${creatorName}\" assigned you a new task: \"${data.title}\".`;

      // No need to notify people about tasks they assign to themselves
      if (String(data.assignedTo) !== String(data.createdBy)) {
        await notifyUsers([
          {
            recipient: data.assignedTo,
            sender: data.createdBy,
            workspaceId: savedTask.workspace,
            type: NotificationTypeEnum.TASK_ASSIGNED,
            message: notificationMessage,
            link: `/workspace/${savedTask.workspace.toString()}/project/${savedTask.project.toString()}`,
          },
        ]);
      }
    }

    // Create activity log
    let activityMessage = parentTitle
      ? `\"${creatorName}\" added the subtask \"${data.title}\" to \"${parentTitle}\"`
      : `\"${creatorName}\" created the task \"${data.title}\"`;
    if (data.assignedTo && String(data.assignedTo) !== String(data.createdBy)) {
      const assignee = await UserModel.findById(data.assignedTo).select("name");
      if (assignee?.name) activityMessage += ` and assigned it to \"${assignee.name}\"`;
    }

    const activityData = {
      user: data.createdBy,
      message: activityMessage,
      workspaceId: data.workspace,
    };

    await ActivityModel.create(activityData);

    emitTaskChanged(data.workspace, {
      action: "created",
      taskId: String(savedTask._id),
      projectId: String(data.project),
      parentTask: data.parentTask ?? null,
    });

    // Return the newly created and saved task document
    return { task: savedTask };
  } catch (error) {
    // Expected problems (bad parent, assignee not a member...) keep their message
    if (error instanceof AppError) throw error;
    console.error("Error creating task in service:", error);
    throw new InternalServerException("Failed to create task.");
  }
};

type UpdateTaskData = z.infer<typeof updateTaskBodySchema> &
  z.infer<typeof taskParamsSchema> & {
    userId: string;
  };

/**
 * Updates an existing task in the database.
 * @param data - The validated task data including task, project, and workspace IDs.
 * @returns An object containing the updated task document.
 */
export const updateTaskService = async (
  data: UpdateTaskData
): Promise<{ task: TaskDocument }> => {
  const { taskId, workspaceId, projectId, userId, ...updateFields } = data;

  const task = await TaskModel.findOne({
    _id: taskId,
    workspace: workspaceId,
    project: projectId,
  });

  if (!task) {
    throw new NotFoundException(
      "Task not found or does not belong to the specified project/workspace."
    );
  }

  if (updateFields.assignedTo) {
    const isAssignedUserMember = await MemberModel.exists({
      userId: updateFields.assignedTo,
      workspaceId: workspaceId,
    });

    if (!isAssignedUserMember) {
      throw new BadRequestException(
        "Assigned user is not a member of this workspace"
      );
    }
  }

  // Track when work was finished (for the dashboard's completion trend)
  const statusFields: Record<string, unknown> = {};
  if (updateFields.status && updateFields.status !== task.status) {
    statusFields.completedAt = updateFields.status === TaskStatusEnum.DONE ? new Date() : null;
  }

  const updatedTask = await TaskModel.findOneAndUpdate(
    {
      _id: taskId,
      workspace: workspaceId,
      project: projectId,
    },
    { ...updateFields, ...statusFields },
    { new: true, runValidators: true }
  );

  if (!updatedTask) {
    throw new NotFoundException("Task not found after update attempt.");
  }

  const updater = await UserModel.findById(userId).select("name");
  const updaterName = updater?.name || "Someone";
  const taskLink = `/workspace/${workspaceId}/project/${projectId}`;
  const previousAssignee = task.assignedTo ? String(task.assignedTo) : null;
  const currentAssignee = updatedTask.assignedTo ? String(updatedTask.assignedTo) : null;

  if (currentAssignee && currentAssignee !== String(userId)) {
    if (currentAssignee !== previousAssignee) {
      // Newly (re)assigned
      await notifyUsers([
        {
          recipient: currentAssignee,
          sender: userId,
          workspaceId,
          type: NotificationTypeEnum.TASK_ASSIGNED,
          message: `\"${updaterName}\" assigned you the task: \"${updatedTask.title}\".`,
          link: taskLink,
        },
      ]);
    } else if (task.status !== updatedTask.status) {
      await notifyUsers([
        {
          recipient: currentAssignee,
          sender: userId,
          workspaceId,
          type: NotificationTypeEnum.TASK_UPDATED,
          message: `\"${updaterName}\" moved your task \"${updatedTask.title}\" to ${updatedTask.status.replace(/_/g, " ").toLowerCase()}.`,
          link: taskLink,
        },
      ]);
    }
  }

  const notificationMessage =
    task.status !== updatedTask.status
      ? `\"${updaterName}\" moved \"${updatedTask.title}\" to ${updatedTask.status.replace(/_/g, " ").toLowerCase()}`
      : `\"${updaterName}\" updated the task \"${updatedTask.title}\"`;

  // Create activity log
  const activityData = {
    user: userId,
    message: notificationMessage,
    workspaceId: updatedTask.workspace,
  };

  await ActivityModel.create(activityData);

  emitTaskChanged(workspaceId, {
    action: "updated",
    taskId: String(updatedTask._id),
    projectId: String(projectId),
    parentTask: updatedTask.parentTask ? String(updatedTask.parentTask) : null,
  });

  await updatedTask.populate(TASK_POPULATE);
  return { task: updatedTask };
};

interface GetAllTasksServiceData {
  workspaceId: string;
  filters: GetAllTasksServiceFilters;
  pagination: {
    pageSize: number;
    pageNumber: number;
  };
  userId: any;
}

/**
 * Retrieves tasks from the database with filtering and pagination.
 * @param data - The data for filtering, sorting, and pagination.
 * @returns An object containing the array of tasks and the total count.
 */
export const getAllTasksService = async (
  data: GetAllTasksServiceData
): Promise<{
  tasks: Array<Record<string, unknown>>;
  totalCount: number;
}> => {
  const { workspaceId, filters, pagination } = data;
  const { pageSize, pageNumber } = pagination;

  // Top-level tasks only, unless asking for one task's subtasks
  const query: Record<string, unknown> = {
    workspace: workspaceId,
    parentTask: filters.parentTask ?? null,
  };

  if (filters.projectId && filters.projectId !== "undefined") {
    query.project = filters.projectId;
  }
  if (filters.status) {
    query.status = { $in: filters.status };
  }
  if (filters.priority) {
    query.priority = { $in: filters.priority };
  }
  if (filters.assignedTo) {
    query.assignedTo = { $in: filters.assignedTo };
  }
  if (filters.dueDate) {
    query.dueDate = { $gte: new Date(filters.dueDate) };
  }
  if (filters.keyword) {
    // Escaped so characters like "(" or "*" are searched for literally
    const regex = new RegExp(escapeRegex(filters.keyword.slice(0, 100)), "i");
    query.$or = [{ title: regex }, { description: regex }, { taskCode: regex }];
  }

  const direction = filters.sortOrder === "asc" ? 1 : -1;
  const sortBy = filters.sortBy ?? "createdAt";

  const [rawTasks, totalCount] = await Promise.all([
    sortBy === "priority"
      ? // priority is a string: sort by rank in memory after fetching the page window
        TaskModel.find(query).populate(TASK_POPULATE).lean()
      : TaskModel.find(query)
          .sort({ [sortBy]: direction, _id: -1 })
          .skip((pageNumber - 1) * pageSize)
          .limit(pageSize)
          .populate(TASK_POPULATE)
          .lean(),
    TaskModel.countDocuments(query),
  ]);

  let tasks = rawTasks;
  if (sortBy === "priority") {
    tasks = [...rawTasks]
      .sort(
        (a, b) =>
          ((PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)) * (direction === 1 ? -1 : 1)
      )
      .slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
  }

  return { tasks: await withSubtaskCounts(tasks), totalCount };
};

/**
 * Retrieves a single task from the database.
 * @param data - The data containing workspace, project, and task IDs.
 * @returns An object containing the task document.
 */
export const getATaskService = async ({
  workspaceId,
  projectId,
  taskId,
}: {
  workspaceId: string;
  projectId: string;
  taskId: string | undefined;
}) => {
  const [task, subtasks] = await Promise.all([
    TaskModel.findOne({ workspace: workspaceId, project: projectId, _id: taskId })
      .populate([
        ...TASK_POPULATE,
        { path: "createdBy", select: "name profilePicture" },
        { path: "parentTask", select: "title taskCode status" },
      ])
      .lean(),
    TaskModel.find({ workspace: workspaceId, parentTask: taskId })
      .sort({ createdAt: 1 })
      .populate(TASK_POPULATE)
      .lean(),
  ]);
  if (!task) throw new NotFoundException("Task not found!");

  return { task, subtasks };
};

/**
 * Deletes a task from the database.
 * @param data - The validated task data including user, workspace, and project IDs.
 * @returns An object containing the deleted task document.
 */
export const deleteTaskService = async ({
  workspaceId,
  projectId,
  taskId,
  userId,
}: {
  workspaceId: string;
  projectId: string;
  taskId: string | undefined;
  userId: string;
}) => {
  // Use a single query to find and delete the task, ensuring it belongs to the correct project and workspace.
  const deletedTask = await TaskModel.findOneAndDelete({
    _id: taskId,
    workspace: workspaceId,
    project: projectId,
  });

  if (!deletedTask) {
    throw new NotFoundException(
      "Task not found or does not belong to the specified project/workspace."
    );
  }

  // A task's subtasks are deleted with it
  await TaskModel.deleteMany({ parentTask: deletedTask._id });

  emitTaskChanged(workspaceId, {
    action: "deleted",
    taskId: String(deletedTask._id),
    projectId: String(projectId),
    parentTask: deletedTask.parentTask ? String(deletedTask.parentTask) : null,
  });

  // Find the user who is deleting the task to get their name.
  const deletingUser = await UserModel.findById(userId).select("name");

  const notificationMessage = `\"${deletingUser?.name ?? "Someone"}\" deleted the task \"${deletedTask.title}\"`;

  // Create activity log
  const activityData = {
    user: userId,
    message: notificationMessage,
    workspaceId: deletedTask.workspace,
  };

  await ActivityModel.create(activityData);

  // Return the deleted task document
  return { task: deletedTask };
};
