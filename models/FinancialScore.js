import mongoose from "mongoose";

const metricsSchema = new mongoose.Schema(
  {
    savingsConsistency: { type: Number, default: 0 },
    incomeStability:    { type: Number, default: 0 },
    expenseControl:     { type: Number, default: 0 },
    budgetHealth:       { type: Number, default: 0 },
    financialTrend:     { type: Number, default: 0 },
  },
  { _id: false }
);

const financialScoreSchema = new mongoose.Schema(
  {
    userId:       { type: String, required: true },
    snapshotHash: { type: String, required: true },
    monthKey:     { type: String, required: true }, // "YYYY-MM" tracks AI call count per month
    score:        { type: Number, required: true },
    statusLabel:  { type: String, default: "" },
    headline:     { type: String, default: "" },
    positives:    { type: [String], default: [] },
    negatives:    { type: [String], default: [] },
    suggestions:  { type: [String], default: [] },
    metrics:      { type: metricsSchema, default: () => ({}) },
    generatedAt:  { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Primary cache lookup: one entry per unique data snapshot per user
financialScoreSchema.index({ userId: 1, snapshotHash: 1 }, { unique: true });
// Monthly AI call count: prevents > 2 AI calls per user per calendar month
financialScoreSchema.index({ userId: 1, monthKey: 1 });
// Latest score lookup
financialScoreSchema.index({ userId: 1, generatedAt: -1 });
// Auto-expire after 90 days
financialScoreSchema.index({ generatedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export default mongoose.model("FinancialScore", financialScoreSchema);
