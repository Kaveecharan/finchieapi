import { asyncHandler } from "../utils/asyncHandler.js";
import { financialScoreService } from "../services/financialScore.service.js";

export const financialScoreController = {
  // GET /score
  getScore: asyncHandler(async (req, res) => {
    const score = await financialScoreService.getScore(req.user.userId, false);
    res.json({ success: true, data: score });
  }),

  // POST /score/refresh
  refreshScore: asyncHandler(async (req, res) => {
    const score = await financialScoreService.getScore(req.user.userId, true);
    res.json({ success: true, data: score });
  }),
};
