import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireFeature } from "../middleware/premium.js";
import { chatController } from "../controllers/chat.controller.js";

const router = Router();

// All chat routes require authentication + premium (ai_chat feature)
router.use(authenticate, requireFeature("ai_chat"));

router.post("/message",  chatController.sendMessage);
router.get("/history",   chatController.getHistory);
router.get("/usage",     chatController.getUsage);
router.delete("/history", chatController.clearHistory);

export default router;
