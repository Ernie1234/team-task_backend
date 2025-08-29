import { z } from "zod";
import { TaskStatusEnum, TaskPriorityEnum } from "@/enums/task-enum";

// A Zod schema to validate the URL parameters (workspaceId, projectId, taskId)
// This is reusable for all routes that use these params.
export const taskParamsSchema = z.object({
  workspaceId: z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
    message: "Invalid workspace ID format.",
  }),
  projectId: z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
    message: "Invalid project ID format.",
  }),
  taskId: z
    .string()
    .refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
      message: "Invalid task ID format.",
    })
    .optional(), // taskId is optional because it doesn't exist for the create route.
});

// Zod schema for the CREATE request BODY.
// This only validates the data coming from the user in the request body.
export const createTaskBodySchema = z.object({
  title: z.string().trim().min(1, "Title is required."),
  description: z.string().trim().nullable().optional(),
  status: z.nativeEnum(TaskStatusEnum).default(TaskStatusEnum.TODO).optional(),
  priority: z
    .nativeEnum(TaskPriorityEnum)
    .default(TaskPriorityEnum.MEDIUM)
    .optional(),
  assignedTo: z
    .string()
    .refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
      message: "Invalid assignedTo ID format.",
    })
    .nullable()
    .optional(),
  dueDate: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => {
        return !val || !isNaN(Date.parse(val));
      },
      {
        message: "Invalid date format. Please provide a valid date.",
      }
    ),
});

// A combined schema for the CREATE request that includes body and params.
// This is useful for type safety and overall validation in your controller.
export const createTaskCombinedSchema = taskParamsSchema.extend({
  body: createTaskBodySchema,
  user: z.object({
    id: z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
      message: "Invalid user ID format.",
    }),
  }),
});

// Zod schema for the UPDATE request BODY.
// All fields are optional because you can update any subset of the fields.
export const updateTaskBodySchema = z.object({
  title: z.string().trim().min(1, "Title cannot be empty.").optional(),
  description: z.string().trim().nullable().optional(),
  status: z.nativeEnum(TaskStatusEnum).optional(),
  priority: z.nativeEnum(TaskPriorityEnum).optional(),
  assignedTo: z
    .string()
    .refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
      message: "Invalid assignedTo ID format.",
    })
    .nullable()
    .optional(),
  dueDate: z.date().nullable().optional(),
});

// A combined schema for the UPDATE request that includes body and params.
export const updateTaskCombinedSchema = taskParamsSchema.extend({
  body: updateTaskBodySchema,
});
export const getAllTasksQuerySchema = z.object({
  projectId: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assignedTo: z.string().optional(),
  keyword: z.string().optional(),
  dueDate: z.string().optional(),
  pageSize: z.string().optional(),
  pageNumber: z.string().optional(),
});

export type GetAllTasksQueryParams = z.infer<typeof getAllTasksQuerySchema>;

// New type to represent the filters after they've been processed
export type GetAllTasksServiceFilters = Omit<
  GetAllTasksQueryParams,
  "status" | "priority" | "assignedTo"
> & {
  status?: string[];
  priority?: string[];
  assignedTo?: string[];
};
