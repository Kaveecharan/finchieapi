import { asyncHandler } from "../utils/asyncHandler.js";
import { aiInsightService } from "../services/aiInsight.service.js";

export const forecastController = {
  // GET /forecast/insights
  // Returns cached AI insights for the current user, or null if unavailable.
  // Free users receive a soft-locked response — no AI call is made.
  getInsights: asyncHandler(async (req, res) => {
    if (!req.isPremium) {
      return res.json({ success: true, data: { locked: true, reason: "premium_required" } });
    }
    const insights = await aiInsightService.getInsights(req.user.userId, false);
    res.json({ success: true, data: insights });
  }),

  // POST /forecast/insights/refresh
  // Bypasses the snapshot hash cache and attempts a fresh AI call (daily limit still applies).
  refreshInsights: asyncHandler(async (req, res) => {
    const insights = await aiInsightService.getInsights(req.user.userId, true);
    res.json({ success: true, data: insights });
  }),
};
