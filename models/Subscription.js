import mongoose from "mongoose";

const { Schema } = mongoose;

// ── Status helper — works on plain objects and Mongoose documents ──────────────
// Centralised here so the same logic is used in models, services and middleware.
// STRICT RULE: premium access requires status in {trialing, active}
// AND the current billing period must not have expired.
// past_due / cancelled / expired / missing → always false, no exceptions.
export const isPremiumActive = (sub, now = new Date()) => {
  if (!sub) return false;
  if (sub.status !== "trialing" && sub.status !== "active") return false;
  if (!sub.currentPeriodEnd) return false;
  const ts = now instanceof Date ? now.getTime() : Number(now);
  return ts < new Date(sub.currentPeriodEnd).getTime();
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

    // ── Billing interval ───────────────────────────────────────────────────
    // Set at activation, never mutated. Null on legacy records → treat as monthly.
    billingInterval: {
      type:    String,
      enum:    ["monthly", "yearly"],
      default: null,
    },

    // ── Billing period ─────────────────────────────────────────────────────
    currentPeriodStart: { type: Date },
    currentPeriodEnd:   { type: Date },

    // ── Cancellation ───────────────────────────────────────────────────────
    // True when the user cancelled but the paid period has not ended yet.
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelledAt:       { type: Date },

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
