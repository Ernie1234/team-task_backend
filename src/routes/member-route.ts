import { joinWorkspaceController } from "@/controllers/member-controller";
import { Router } from "express";

const router = Router();

router.post("/workspace/:inviteCode/join", joinWorkspaceController);

export default router;
