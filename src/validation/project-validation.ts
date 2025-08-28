import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, { message: "Project name cannot be empty." }),
  description: z.string().trim().optional().nullable(),
  emoji: z.string().trim().optional(),
  workspace: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, { message: "Invalid workspace ID." }),
  createdBy: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, { message: "Invalid user ID." }),
});

export const projectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, { message: "Invalid project ID." });

// ====================================================================
// Zod Schema for Project Updates (Optional but Recommended)
// This schema validates data for updating an existing project.
// .partial() makes all fields optional, which is suitable for update operations.
// ====================================================================

export const updateProjectSchema = createProjectSchema.partial();

/**
 * Type for the request body when creating a new project.
 */
export type TCreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Type for a project ID.
 */
export type TProjectIdInput = z.infer<typeof projectIdSchema>;

/**
 * Type for the request body when updating a project.
 * All fields are optional.
 */
export type TUpdateProjectInput = z.infer<typeof updateProjectSchema>;
