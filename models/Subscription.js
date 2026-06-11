import mongoose from "mongoose";

const { Schema } = mongoose;

// ── Status helper — works on plain objects and Mongoose documents ──────────────
// Centralised here so the same logic is used in models, services and middleware.
export const isPremiumActive = (sub) => {
  if (!sub) return false;
  const now = Date.now();
  switch (sub.status) {
    case "trialing":
      return !sub.trialEnd || now <= new Date(sub.trialEnd).getTime();
    case "active":
      return true;
    case "cancelled":
      // Premium access continues until the paid period expires
      return !!sub.currentPeriodEnd && now <= new Date(sub.currentPeriodEnd).getTime();
    case "past_due":
      // Honour a grace period window after payment failure
      if (sub.gracePeriodEnd && now <= new Date(sub.gracePeriodEnd).getTime()) return true;
      return !!sub.currentPeriodEnd && now <= new Date(sub.currentPeriodEnd).getTime();
    default:
      return false;
  }
};

// ── Days remaining in trial/period ────────────────────────────────────────────
export const daysRemaining = (dateValue) => {
  if (!dateValue) return 0;
  const diff = new Date(dateValue).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
};

// ── Main schema ───────────────────────────────────────────────────────────────
const SubscriptionSchema = new Schema(
  {
    // One subscription record per user
    userId: { type: String, required: true, unique: true, index: true },

    // ── Stripe identifiers ─────────────────────────────────────────────────
    stripeCustomerId:     { type: String, required: true, unique: true },
    stripeSubscriptionId: { type: String, sparse: true },
    stripePriceId:        { type: String },

    // ── Plan & status ──────────────────────────────────────────────────────
    plan: {
      type: String,
      enum: ["free", "premium"],
      default: "free",
    },
    // Mirrors Stripe subscription statuses. "expired" is our own sentinel for
    // accounts that never subscribed or whose subscription fully ended.
    status: {
      type: String,
      enum: ["trialing", "active", "past_due", "cancelled", "expired"],
      default: "expired",
    },

    // ── Trial window ───────────────────────────────────────────────────────
    trialStart: { type: Date },
    trialEnd:   { type: Date },

    // ── Billing period ─────────────────────────────────────────────────────
    currentPeriodStart: { type: Date },
    currentPeriodEnd:   { type: Date },

    // ── Cancellation ───────────────────────────────────────────────────────
    // True when the user cancelled but the paid period has not ended yet.
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelledAt:       { type: Date },

    // ── Grace period (past_due recovery window) ────────────────────────────
    gracePeriodEnd: { type: Date },

    // ── Renewal reminder tracking (cron dedup) ────────────────────────────
    renewalReminderSentAt: { type: Date, default: null },

    // ── Webhook idempotency ────────────────────────────────────────────────
    lastStripeEventId: { type: String },
    lastStripeEventAt: { type: Date },
  },
  { timestamps: true }
);

// ── Instance method (Mongoose document) ──────────────────────────────────────
SubscriptionSchema.methods.isPremiumActive = function () {
  return isPremiumActive(this);
};

SubscriptionSchema.methods.daysUntilTrialEnd = function () {
  return daysRemaining(this.trialEnd);
};

SubscriptionSchema.methods.daysUntilPeriodEnd = function () {
  return daysRemaining(this.currentPeriodEnd);
};

export default mongoose.model("Subscription", SubscriptionSchema);
