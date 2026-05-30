import Subscription, { isPremiumActive } from "../models/Subscription.js";
import User from "../models/User.js";
import { stripeService } from "./stripe.service.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../errors/AppError.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fromStripeTimestamp = (ts) => (ts ? new Date(ts * 1000) : undefined);

const normaliseStatus = (stripeStatus) =>
  stripeStatus === "canceled" ? "cancelled" : stripeStatus;

const formatForClient = (sub) => {
  if (!sub) return { plan: "free", status: "expired", isPremium: false };
  return {
    plan:               sub.plan,
    status:             sub.status,
    isPremium:          isPremiumActive(sub),
    trialStart:         sub.trialStart,
    trialEnd:           sub.trialEnd,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd:   sub.currentPeriodEnd,
    cancelAtPeriodEnd:  sub.cancelAtPeriodEnd ?? false,
  };
};

const assertStripeConfigured = () => {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
    throw new AppError(
      "Subscription service is not available. Stripe is not configured.",
      503,
      "STRIPE_NOT_CONFIGURED"
    );
  }
};

// ── Service ───────────────────────────────────────────────────────────────────

export const subscriptionService = {
  // GET /subscriptions/me
  getForUser: async (userId) => {
    const sub = await Subscription.findOne({ userId }).lean();
    return formatForClient(sub);
  },

  // POST /subscriptions/setup
  // Creates a Stripe Customer (if needed) + SetupIntent.
  // Returns client_secret for the mobile Stripe Payment Sheet.
  // NOTE: accepts userId (string) not req.user — req.user only carries JWT claims.
  setup: async (userId) => {
    assertStripeConfigured();

    // Fetch full user to get email / display name for the Stripe customer record
    const user = await User.findOne({ userId }, {
      email: 1, firstName: 1, lastName: 1,
    }).lean();

    if (!user) throw new AppError("User not found.", 404, "NOT_FOUND");

    let sub = await Subscription.findOne({ userId });

    if (!sub?.stripeCustomerId) {
      const customer = await stripeService.createCustomer({
        email:  user.email,
        name:   `${user.firstName} ${user.lastName ?? ""}`.trim(),
        userId,
      });

      sub = await Subscription.findOneAndUpdate(
        { userId },
        { $set: { stripeCustomerId: customer.id } },
        { upsert: true, new: true }
      );

      logger.info({ event: "stripe_customer_created", userId, customerId: customer.id });
    }

    const setupIntent = await stripeService.createSetupIntent(sub.stripeCustomerId);

    return {
      clientSecret:   setupIntent.client_secret,
      publishableKey: env.STRIPE_PUBLISHABLE_KEY ?? "",
    };
  },

  // POST /subscriptions/activate
  // Called after the Stripe Payment Sheet confirms the card.
  activate: async (userId) => {
    assertStripeConfigured();

    const sub = await Subscription.findOne({ userId });

    if (!sub?.stripeCustomerId) {
      throw new AppError(
        "Payment setup not found. Please complete payment setup first.",
        400,
        "SETUP_REQUIRED"
      );
    }

    if (sub.stripeSubscriptionId && ["active", "trialing"].includes(sub.status)) {
      throw new AppError("Subscription is already active.", 409, "ALREADY_SUBSCRIBED");
    }

    const stripeSub = await stripeService.createSubscription(
      sub.stripeCustomerId,
      env.STRIPE_PRICE_ID,
      30
    );

    const updated = await Subscription.findOneAndUpdate(
      { userId },
      {
        $set: {
          stripeSubscriptionId: stripeSub.id,
          stripePriceId:        env.STRIPE_PRICE_ID,
          plan:                 "premium",
          status:               normaliseStatus(stripeSub.status),
          trialStart:           fromStripeTimestamp(stripeSub.trial_start),
          trialEnd:             fromStripeTimestamp(stripeSub.trial_end),
          currentPeriodStart:   fromStripeTimestamp(stripeSub.current_period_start),
          currentPeriodEnd:     fromStripeTimestamp(stripeSub.current_period_end),
          cancelAtPeriodEnd:    false,
        },
      },
      { new: true }
    );

    logger.info({ event: "subscription_activated", userId, stripeSubId: stripeSub.id });
    return formatForClient(updated);
  },

  // POST /subscriptions/cancel
  cancel: async (userId) => {
    assertStripeConfigured();

    const sub = await Subscription.findOne({ userId });

    if (!sub?.stripeSubscriptionId) {
      throw new AppError("No active subscription found.", 404, "NOT_FOUND");
    }
    if (!["active", "trialing"].includes(sub.status) || sub.cancelAtPeriodEnd) {
      throw new AppError("Subscription is not in a cancellable state.", 400, "INVALID_STATE");
    }

    await stripeService.cancelAtPeriodEnd(sub.stripeSubscriptionId);

    const updated = await Subscription.findOneAndUpdate(
      { userId },
      { $set: { cancelAtPeriodEnd: true, cancelledAt: new Date() } },
      { new: true }
    );

    logger.info({ event: "subscription_cancel_scheduled", userId });
    return formatForClient(updated);
  },

  // POST /subscriptions/reactivate
  reactivate: async (userId) => {
    assertStripeConfigured();

    const sub = await Subscription.findOne({ userId });

    if (!sub?.stripeSubscriptionId) {
      throw new AppError("No subscription found.", 404, "NOT_FOUND");
    }
    if (!sub.cancelAtPeriodEnd) {
      throw new AppError("Subscription is not scheduled to cancel.", 400, "INVALID_STATE");
    }

    await stripeService.reactivate(sub.stripeSubscriptionId);

    const updated = await Subscription.findOneAndUpdate(
      { userId },
      { $set: { cancelAtPeriodEnd: false, cancelledAt: null } },
      { new: true }
    );

    logger.info({ event: "subscription_reactivated", userId });
    return formatForClient(updated);
  },

  // POST /subscriptions/webhook
  handleWebhookEvent: async (event) => {
    const { type, id: eventId } = event;
    const obj = event.data.object;

    // Idempotency — skip already-processed events
    const alreadyProcessed = await Subscription.exists({ lastStripeEventId: eventId });
    if (alreadyProcessed) {
      logger.info({ event: "stripe_webhook_duplicate", eventId });
      return;
    }

    const meta = { lastStripeEventId: eventId, lastStripeEventAt: new Date() };

    switch (type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await Subscription.findOneAndUpdate(
          { stripeCustomerId: obj.customer },
          {
            $set: {
              stripeSubscriptionId: obj.id,
              plan:               "premium",
              status:             normaliseStatus(obj.status),
              trialStart:         fromStripeTimestamp(obj.trial_start),
              trialEnd:           fromStripeTimestamp(obj.trial_end),
              currentPeriodStart: fromStripeTimestamp(obj.current_period_start),
              currentPeriodEnd:   fromStripeTimestamp(obj.current_period_end),
              cancelAtPeriodEnd:  obj.cancel_at_period_end,
              ...meta,
            },
          }
        );
        break;
      }

      case "customer.subscription.deleted": {
        await Subscription.findOneAndUpdate(
          { stripeCustomerId: obj.customer },
          { $set: { status: "expired", plan: "free", ...meta } }
        );
        break;
      }

      case "invoice.payment_succeeded": {
        if (!obj.subscription) break;
        await Subscription.findOneAndUpdate(
          { stripeCustomerId: obj.customer },
          {
            $set: {
              status:             "active",
              plan:               "premium",
              currentPeriodStart: fromStripeTimestamp(obj.period_start),
              currentPeriodEnd:   fromStripeTimestamp(obj.period_end),
              gracePeriodEnd:     null,
              ...meta,
            },
          }
        );
        break;
      }

      case "invoice.payment_failed": {
        const gracePeriodEnd = obj.next_payment_attempt
          ? fromStripeTimestamp(obj.next_payment_attempt)
          : new Date(Date.now() + 3 * 86_400_000);

        await Subscription.findOneAndUpdate(
          { stripeCustomerId: obj.customer },
          { $set: { status: "past_due", gracePeriodEnd, ...meta } }
        );
        break;
      }

      case "customer.subscription.trial_will_end": {
        logger.info({
          event:      "stripe_trial_will_end",
          customerId: obj.customer,
          trialEnd:   fromStripeTimestamp(obj.trial_end),
        });
        break;
      }

      default:
        logger.info({ event: "stripe_webhook_unhandled", type });
    }
  },
};
