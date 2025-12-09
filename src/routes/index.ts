import { Router } from "express";

import authRoute from "./auth-route";
import userRoute from "./user-route";
import { isAuthenticated } from "@/middlewares/isAuthenticatedMiddleware";
import workspaceRoute from "./workspace-route";
import membersRoute from "./member-route";
import projectsRoute from "./project-route";
import taskRoute from "./task-route";
import notificationRoute from "./notification-route";
import activitiesRoute from "./activities-route";
import chatRoute from "./chat-route";

const apiRouter: Router = Router();

apiRouter.use("/auth", authRoute);
apiRouter.use("/user", isAuthenticated, userRoute);
apiRouter.use("/workspace", isAuthenticated, workspaceRoute);
apiRouter.use("/members", isAuthenticated, membersRoute);
apiRouter.use("/projects", isAuthenticated, projectsRoute);
apiRouter.use("/tasks", isAuthenticated, taskRoute);
apiRouter.use("/notifications", isAuthenticated, notificationRoute);
apiRouter.use("/activities", isAuthenticated, activitiesRoute);
apiRouter.use("/chat", chatRoute);

export default apiRouter;
