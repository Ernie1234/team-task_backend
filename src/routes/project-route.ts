import { createProjectController } from "@/controllers/project-controller";
import { Router } from "express";

const router = Router();

router.post("/create", createProjectController);

export default router;
