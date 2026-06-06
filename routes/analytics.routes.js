import express from "express";
import { analyticsController } from "../controllers/analytics.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireFeature } from "../middleware/premium.js";

const router = express.Router();

router.use(authenticate);

// dashboard + activeMonths: free tier — current-month data and the date picker
router.get("/dashboard",     analyticsController.dashboard);
router.get("/active-months", analyticsController.activeMonths);

// trend: premium only — historical multi-month charts ("Analytics beyond 3 months")
router.get("/trend", requireFeature("advanced_analytics"), analyticsController.trend);

export default router;
