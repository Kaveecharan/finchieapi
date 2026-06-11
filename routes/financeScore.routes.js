import express from "express";
import { financeScoreController } from "../controllers/financeScore.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireFeature } from "../middleware/premium.js";

const router = express.Router();

router.use(authenticate);
router.use(requireFeature("finance_score"));

router.get("/current", financeScoreController.getCurrent);
router.get("/history", financeScoreController.getHistory);

export default router;
