import mongoose from "mongoose";

const responseSchema = new mongoose.Schema(
  {
    trendSummary:     { type: String, default: "" },
    spendingInsights: { type: [String], default: [] },
    savingsInsights:  { type: [String], default: [] },
    riskWarning:      { type: String, default: null },
    suggestion:       { type: String, default: "" },
  },
  { _id: false }
);

const aiInsightCacheSchema = new mongoose.Schema(
  {
    userId:       { type: String, required: true },
    snapshotHash: { type: String, required: true },
    dayKey:       { type: String, required: true }, // "YYYY-MM-DD" of when AI was called
    response:     { type: responseSchema, required: true },
    generatedAt:  { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Primary lookup: by userId + snapshotHash (one entry per unique data snapshot)
aiInsightCacheSchema.index({ userId: 1, snapshotHash: 1 }, { unique: true });
// Daily limit check: count how many AI calls a user made today
aiInsightCacheSchema.index({ userId: 1, dayKey: 1 });
// Auto-delete entries older than 30 days
aiInsightCacheSchema.index({ generatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export default mongoose.model("AiInsightCache", aiInsightCacheSchema);
