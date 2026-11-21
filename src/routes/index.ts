import { Router } from "express";

import userRoute from "./user-route";
import { isAuthenticated } from "@/middlewares/isAuthenticatedMiddleware";
import workspaceRoute from "./workspace-route";
import membersRoute from "./member-route";
import projectsRoute from "./project-route";
import taskRoute from "./task-route";
import notificationRoute from "./notification-route";
import activitiesRoute from "./activities-route";
import chatRoute from "./chat-route";
import noteRoute from "./note-route";
import calendarRoute from "./calendar-route";
import emailRoute from "./email-route";

const apiRouter: Router = Router();

// Sign-in, sign-up and sessions are handled by Better Auth at /api/v1/auth (see index.ts)
// Unsubscribe links from emails (signed, no sign-in needed)
apiRouter.use("/email", emailRoute);
apiRouter.use("/user", isAuthenticated, userRoute);
apiRouter.use("/workspace", isAuthenticated, workspaceRoute);
apiRouter.use("/members", isAuthenticated, membersRoute);
apiRouter.use("/projects", isAuthenticated, projectsRoute);
apiRouter.use("/tasks", isAuthenticated, taskRoute);
apiRouter.use("/notifications", isAuthenticated, notificationRoute);
apiRouter.use("/activities", isAuthenticated, activitiesRoute);
apiRouter.use("/chat", chatRoute);
apiRouter.use("/notes", isAuthenticated, noteRoute);
apiRouter.use("/calendar", isAuthenticated, calendarRoute);

export default apiRouter;
