import { getCurrentUserController } from "@/controllers/user-controller";
import { Router } from "express";

const router = Router();

router.get("/current", getCurrentUserController);

export default router;
