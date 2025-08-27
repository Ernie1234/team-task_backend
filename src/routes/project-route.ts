import { createProjectController } from "@/controllers/project-controller";
import { Router } from "express";

const router = Router();

router.post("/", createProjectController);

export default router;
