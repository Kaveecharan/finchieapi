import FinanceScore from "../models/FinanceScore.js";

export const financeScoreRepository = {
  findByUserId: (userId) =>
    FinanceScore.findOne({ userId }).lean(),

  // Returns all users whose score is due for recalculation (or never scored).
  findDueUsers: () =>
    FinanceScore.find({ nextCalculationAt: { $lte: new Date() } })
      .select("userId")
      .lean(),

  // Returns users that have never been scored (no document exists).
  // Used in combination with findDueUsers for the initial batch.
  findScoredUserIds: () =>
    FinanceScore.find({}).select("userId").lean().then((docs) =>
      docs.map((d) => d.userId)
    ),

  findHistory: (userId) =>
    FinanceScore.findOne({ userId }, { history: 1, _id: 0 }).lean(),

  // Atomically save the new score and push the old score to history (newest-first, max 26).
  upsert: async (userId, data) => {
    const existing = await FinanceScore.findOne({ userId }).lean();

    const setFields = { ...data };
    let pushOp = null;

    if (existing) {
      // Archive the current score before overwriting it
      const historyEntry = {
        score:        existing.score,
        rating:       existing.rating,
        calculatedAt: existing.calculatedAt,
        scoreChange:  existing.scoreChange ?? null,
        summary:      existing.summary ?? "",
      };
      pushOp = {
        history: {
          $each:     [historyEntry],
          $position: 0,
          $slice:    26,
        },
      };
    }

    return FinanceScore.findOneAndUpdate(
      { userId },
      {
        $set:  setFields,
        ...(pushOp ? { $push: pushOp } : {}),
      },
      { new: true, upsert: true, runValidators: true }
    ).lean();
  },
};
