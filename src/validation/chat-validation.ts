import { z } from "zod";

export const chatTypeSchema = z.enum(["workspace", "project", "direct"]);

export const getWorkspaceMessagesSchema = z.object({
  workspaceId: z.string().min(1, "Workspace ID is required"),
});

export const getProjectMessagesSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
});

export const getDirectMessagesSchema = z.object({
  otherUserId: z.string().min(1, "Other user ID is required"),
});

export const searchMessagesSchema = z.object({
  q: z.string().min(1, "Search query is required").max(100, "Search query too long"),
  limit: z.string().optional().refine(
    (val) => !val || (parseInt(val) > 0 && parseInt(val) <= 50),
    "Limit must be between 1 and 50"
  ),
});

export const markAsReadSchema = z.object({
  lastMessageId: z.string().optional(),
});

export const messageValidationSchema = z.object({
  content: z.string()
    .min(1, "Message content is required")
    .max(2000, "Message too long (max 2000 characters)")
    .trim(),
  chatType: chatTypeSchema,
  workspace: z.string().optional(),
  project: z.string().optional(),
  otherUserId: z.string().optional(),
  messageType: z.enum(["text", "image", "file", "system"]).default("text"),
  replyTo: z.string().optional(),
}).refine((data) => {
  // Validate that required fields are present based on chat type
  if (data.chatType === "workspace" && !data.workspace) {
    return false;
  }
  if (data.chatType === "project" && !data.project) {
    return false;
  }
  if (data.chatType === "direct" && !data.otherUserId) {
    return false;
  }
  return true;
}, {
  message: "Required fields missing for the specified chat type",
});

export const roomJoinSchema = z.object({
  chatType: chatTypeSchema,
  workspace: z.string().optional(),
  project: z.string().optional(),
  otherUserId: z.string().optional(),
}).refine((data) => {
  // Validate that required fields are present based on chat type
  if (data.chatType === "workspace" && !data.workspace) {
    return false;
  }
  if (data.chatType === "project" && !data.project) {
    return false;
  }
  if (data.chatType === "direct" && !data.otherUserId) {
    return false;
  }
  return true;
}, {
  message: "Required fields missing for the specified chat type",
});

export const sendMessageSchema = z.object({
  content: z.string()
    .min(1, "Message content is required")
    .max(2000, "Message too long (max 2000 characters)")
    .trim(),
  messageType: z.enum(["text", "image", "file", "system"]).optional().default("text"),
  replyTo: z.string().optional(),
});
