import { Router } from "express";
import { isAuthenticated } from "@/middlewares/isAuthenticatedMiddleware";
import {
  getWorkspaceMessagesController,
  getProjectMessagesController,
  getDirectMessagesController,
  getOnlineUsersController,
  getWorkspaceMembersController,
  searchWorkspaceMessagesController,
  searchProjectMessagesController,
  markMessagesAsReadController,
  getWorkspaceStatsController,
  getDirectConversationsController,
  sendWorkspaceMessageController,
  sendProjectMessageController,
  sendDirectMessageController,
  uploadChatFilesController,
  getWorkspaceConversationsController,
  markRoomReadController,
  getRoomAttachmentsController,
} from "@/controllers/chat-controller";
import { chatUploadMiddleware } from "@/config/uploads";

const chatRouter = Router();

// All chat routes require authentication
chatRouter.use(isAuthenticated);

// Workspace chat routes
chatRouter.get("/workspace/:workspaceId/messages", getWorkspaceMessagesController);
chatRouter.post("/workspace/:workspaceId/messages", sendWorkspaceMessageController);
chatRouter.get("/workspace/:workspaceId/online-users", getOnlineUsersController);
chatRouter.get("/workspace/:workspaceId/members", getWorkspaceMembersController);
chatRouter.get("/workspace/:workspaceId/search", searchWorkspaceMessagesController);
chatRouter.get("/workspace/:workspaceId/stats", getWorkspaceStatsController);
chatRouter.get("/workspace/:workspaceId/conversations", getWorkspaceConversationsController);

// Project chat routes
chatRouter.get("/project/:projectId/messages", getProjectMessagesController);
chatRouter.post("/project/:projectId/messages", sendProjectMessageController);
chatRouter.get("/project/:projectId/search", searchProjectMessagesController);

// Direct message routes
chatRouter.get("/direct/:otherUserId/messages", getDirectMessagesController);
chatRouter.post("/direct/:otherUserId/messages", sendDirectMessageController);
chatRouter.get("/direct/conversations", getDirectConversationsController);

// Attachments: upload first, then send the returned attachments with the message
chatRouter.post("/uploads", chatUploadMiddleware, uploadChatFilesController);

// General chat routes
chatRouter.post("/rooms/read", markRoomReadController);
chatRouter.get("/rooms/:roomId/attachments", getRoomAttachmentsController);
chatRouter.post("/messages/mark-read", markMessagesAsReadController);

export default chatRouter;