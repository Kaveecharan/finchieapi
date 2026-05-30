import { analyticsService } from "../services/analytics.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const analyticsController = {
  dashboard: asyncHandler(async (req, res) => {
    const { month } = req.query; // optional "YYYY-MM" string
    const data = await analyticsService.getDashboard(req.user.userId, month);
    res.json({ success: true, data });
  }),

  trend: asyncHandler(async (req, res) => {
    const months = Math.min(24, Math.max(1, parseInt(req.query.months, 10) || 6));
    const data = await analyticsService.getTrend(req.user.userId, months);
    res.json({ success: true, data });
  }),

  activeMonths: asyncHandler(async (req, res) => {
    const months = await analyticsService.getActiveMonths(req.user.userId);
    res.json({ success: true, data: months });
  }),
};
