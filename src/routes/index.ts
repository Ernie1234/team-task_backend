import { Router } from "express";

import authRoute from "./auth-route";
import userRoute from "./user-route";
import { isAuthenticated } from "@/middlewares/isAuthenticatedMiddleware";
import workspaceRoute from "./workspace-route";
import membersRoute from "./member-route";

const apiRouter: Router = Router();

apiRouter.use("/auth", authRoute);
apiRouter.use("/user", isAuthenticated, userRoute);
apiRouter.use("/workspace", isAuthenticated, workspaceRoute);
apiRouter.use("/members", isAuthenticated, membersRoute);

export default apiRouter;
