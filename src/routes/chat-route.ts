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
} from "@/controllers/chat-controller";

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

// Project chat routes
chatRouter.get("/project/:projectId/messages", getProjectMessagesController);
chatRouter.post("/project/:projectId/messages", sendProjectMessageController);
chatRouter.get("/project/:projectId/search", searchProjectMessagesController);

// Direct message routes
chatRouter.get("/direct/:otherUserId/messages", getDirectMessagesController);
chatRouter.post("/direct/:otherUserId/messages", sendDirectMessageController);
chatRouter.get("/direct/conversations", getDirectConversationsController);

// General chat routes
chatRouter.post("/messages/mark-read", markMessagesAsReadController);

export default chatRouter;