import express from "express";
import { analyticsController } from "../controllers/analytics.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = express.Router();

router.use(authenticate);

router.get("/dashboard", analyticsController.dashboard);
router.get("/trend", analyticsController.trend);
router.get("/active-months", analyticsController.activeMonths);

export default router;
