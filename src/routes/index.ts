import { Router } from "express";
import authRoute from "./auth-router";

const apiRouter: Router = Router();

apiRouter.use("/auth", authRoute);

export default apiRouter;
