import mongoose from "mongoose";

// Caches AI responses keyed by (userId, snapshotHash, questionHash).
// A cache hit means: same user, same financial state, same question → reuse answer.
// TTL is short (7 days) because financial context shifts over a week.

const chatCacheSchema = new mongoose.Schema(
  {
    userId:       { type: String, required: true },
    snapshotHash: { type: String, required: true }, // SHA-256 of compact financial summary
    questionHash: { type: String, required: true }, // SHA-256 of normalised question text
    response:     { type: String, required: true },
    createdAt:    { type: Date,   default: Date.now },
  },
  { timestamps: false }
);

// Primary lookup: one entry per (user, financial state, question)
chatCacheSchema.index({ userId: 1, snapshotHash: 1, questionHash: 1 }, { unique: true });
// TTL: 7 days
chatCacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

export default mongoose.model("ChatCache", chatCacheSchema);
