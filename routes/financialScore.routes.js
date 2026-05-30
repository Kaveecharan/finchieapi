import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireFeature } from "../middleware/premium.js";
import { financialScoreController } from "../controllers/financialScore.controller.js";

const router = Router();
router.use(authenticate);

router.get("/",         financialScoreController.getScore);
router.post("/refresh", requireFeature("ai_score"), financialScoreController.refreshScore);

export default router;
