import { TaskPriorityEnum, TaskStatusEnum } from "@/enums/task-enum";
import MemberModel from "@/models/member-model";
import ProjectModel from "@/models/project-model";
import type { TaskDocument } from "@/models/task-model";
import TaskModel from "@/models/task-model";
import {
  BadRequestException,
  InternalServerException,
  NotFoundException,
} from "@/utils/appError";
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
    });

    const savedTask = await newTask.save();

    // Return the newly created and saved task document
    return { task: savedTask };
  } catch (error) {
    // Catch any Mongoose or other unexpected errors and throw a custom exception
    // to be handled by the global error handler.
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
  const { taskId, workspaceId, projectId, ...updateFields } = data;

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

  const updatedTask = await TaskModel.findOneAndUpdate(
    {
      _id: taskId,
      workspace: workspaceId,
      project: projectId,
    },
    updateFields,
    { new: true, runValidators: true }
  );

  if (!updatedTask) {
    throw new NotFoundException("Task not found after update attempt.");
  }

  return { task: updatedTask };
};

interface GetAllTasksServiceData {
  workspaceId: string;
  filters: GetAllTasksServiceFilters;
  pagination: {
    pageSize: number;
    pageNumber: number;
  };
}

/**
 * Retrieves tasks from the database with filtering and pagination.
 * @param data - The data for filtering, sorting, and pagination.
 * @returns An object containing the array of tasks and the total count.
 */
export const getAllTasksService = async (
  data: GetAllTasksServiceData
): Promise<{ tasks: TaskDocument[]; totalCount: number }> => {
  const { workspaceId, filters, pagination } = data;
  const { pageSize, pageNumber } = pagination;

  const query: any = { workspace: workspaceId };

  // Apply projectId filter if it exists and is valid
  if (filters.projectId) {
    // You may want to add validation here to ensure it's a valid ObjectId format
    query.project = filters.projectId;
  }

  // Apply filters based on the query parameters
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
    // You may want to add specific date range queries here
    query.dueDate = { $gte: new Date(filters.dueDate) };
  }
  if (filters.keyword) {
    // Use a regex search for case-insensitive keyword matching on title and description
    const regex = new RegExp(filters.keyword, "i");
    query.$or = [{ title: regex }, { description: regex }];
  }

  const tasks = await TaskModel.find(query)
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize)
    .exec();

  const totalCount = await TaskModel.countDocuments(query);

  return { tasks, totalCount };
};
