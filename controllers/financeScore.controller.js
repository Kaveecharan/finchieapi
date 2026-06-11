import { financeScoreService } from "../services/financeScore.service.js";

export const financeScoreController = {
  getCurrent: async (req, res, next) => {
    try {
      const score = await financeScoreService.getCurrent(req.user.userId);
      res.json({ success: true, data: score ?? null });
    } catch (err) {
      next(err);
    }
  },

  getHistory: async (req, res, next) => {
    try {
      const history = await financeScoreService.getHistory(req.user.userId);
      res.json({ success: true, data: history });
    } catch (err) {
      next(err);
    }
  },
};
