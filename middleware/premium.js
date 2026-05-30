import Subscription, { isPremiumActive } from "../models/Subscription.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ForbiddenError } from "../errors/AppError.js";

// ── Feature catalogue ─────────────────────────────────────────────────────────
// Any feature in this set requires an active premium subscription.
export const PREMIUM_FEATURES = new Set([
  "ai_score",          // Financial health score (AI-generated)
  "ai_forecast",       // AI spending forecast + insights
  "advanced_analytics",// Analytics beyond 3 months
  "unlimited_history", // Transaction history beyond 6 months
  "export",            // PDF / CSV export
  "advanced_filters",  // Multi-criteria filtering
  "smart_search",      // Full-text smart search
  "enhanced_charts",   // Heatmaps and advanced visualisations
  "priority_support",  // Priority support channel
]);

// ── attachSubscription ────────────────────────────────────────────────────────
// Enriches req with subscription context without blocking non-premium users.
// Place after authenticate when you need req.isPremium but want the route
// accessible to all users (e.g. for blurred previews or quota-aware responses).
export const attachSubscription = asyncHandler(async (req, res, next) => {
  const sub = await Subscription.findOne({ userId: req.user.userId }).lean();
  req.subscription = sub;
  req.isPremium    = isPremiumActive(sub);
  next();
});

// ── requirePremium ────────────────────────────────────────────────────────────
// Hard gate: returns 403 if the user does not have an active premium subscription.
// Always chain after authenticate.
export const requirePremium = asyncHandler(async (req, res, next) => {
  // Re-use sub if attachSubscription already ran earlier in the chain
  if (req.subscription === undefined) {
    const sub    = await Subscription.findOne({ userId: req.user.userId }).lean();
    req.subscription = sub;
    req.isPremium    = isPremiumActive(sub);
  }

  if (!req.isPremium) {
    throw new ForbiddenError("Premium subscription required to access this feature.");
  }
  next();
});

// ── requireFeature(feature) ───────────────────────────────────────────────────
// Returns a middleware that gates on a specific feature flag.
// Usage: router.get('/export', authenticate, requireFeature('export'), controller)
export const requireFeature = (feature) =>
  asyncHandler(async (req, res, next) => {
    if (!PREMIUM_FEATURES.has(feature)) return next(); // free feature — always pass

    if (req.subscription === undefined) {
      const sub    = await Subscription.findOne({ userId: req.user.userId }).lean();
      req.subscription = sub;
      req.isPremium    = isPremiumActive(sub);
    }

    if (!req.isPremium) {
      throw new ForbiddenError(`Premium required: ${feature}`);
    }
    next();
  });
