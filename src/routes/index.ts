import { Router } from "express";
import authRoute from "./auth-route";
import userRoute from "./user-route";
import { isAuthenticated } from "@/middlewares/isAuthenticatedMiddleware";

const apiRouter: Router = Router();

apiRouter.use("/auth", authRoute);
apiRouter.use("/user", isAuthenticated, userRoute);

export default apiRouter;
