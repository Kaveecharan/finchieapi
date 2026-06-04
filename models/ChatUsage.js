import mongoose from "mongoose";

// One document per user per calendar month.
// Tracks AI (Type B) calls separately from total messages so quota is
// only charged when OpenAI is actually invoked.

export const MONTHLY_AI_LIMIT = 50;  // Type B calls per month (premium)
export const DAILY_AI_LIMIT   = 10;  // Type B calls per day (abuse ceiling)
export const MSG_COOLDOWN_MS  = 3_000; // min ms between any two messages

const chatUsageSchema = new mongoose.Schema(
  {
    userId:           { type: String, required: true },
    monthKey:         { type: String, required: true }, // "YYYY-MM"

    aiCallsMonth:     { type: Number, default: 0 }, // Type B calls this month
    totalMsgsMonth:   { type: Number, default: 0 }, // all messages this month

    aiCallsDay:       { type: Number, default: 0 }, // Type B calls today
    dayKey:           { type: String, default: "" }, // "YYYY-MM-DD"

    lastMessageAt:    { type: Date },
  },
  { timestamps: false }
);

// One doc per user per month
chatUsageSchema.index({ userId: 1, monthKey: 1 }, { unique: true });
// Fast lookup of today's usage
chatUsageSchema.index({ userId: 1, dayKey: 1 });
// Auto-expire after 3 months (history only; hard limits are per-month anyway)
chatUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

chatUsageSchema.add({ createdAt: { type: Date, default: Date.now } });

export default mongoose.model("ChatUsage", chatUsageSchema);
