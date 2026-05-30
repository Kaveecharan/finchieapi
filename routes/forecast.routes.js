import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { attachSubscription, requireFeature } from "../middleware/premium.js";
import { forecastController } from "../controllers/forecast.controller.js";

const router = Router();
router.use(authenticate);

router.get("/insights",          attachSubscription,              forecastController.getInsights);
router.post("/insights/refresh", requireFeature("ai_forecast"),   forecastController.refreshInsights);

export default router;
