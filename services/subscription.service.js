import Subscription, { isPremiumActive } from "../models/Subscription.js";
import User from "../models/User.js";
import { stripeService } from "./stripe.service.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../errors/AppError.js";
import {
  sendSubscriptionActivatedEmail,
  sendTrialEndingSoonEmail,
  sendPaymentSucceededEmail,
  sendPaymentFailedEmail,
  sendCardUpdatedEmail,
  sendSubscriptionCancelledEmail,
  sendSubscriptionExpiredEmail,
} from "./email.service.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fromStripeTimestamp = (ts) => (ts ? new Date(ts * 1000) : undefined);

// Look up user email/name from a Stripe customer ID — used in webhook context.
const getUserByCustomerId = async (customerId) => {
  const sub = await Subscription.findOne({ stripeCustomerId: customerId })
    .select("userId")
    .lean();
  if (!sub?.userId) return null;
  return User.findOne({ userId: sub.userId }, { email: 1, firstName: 1 }).lean();
};

const normaliseStatus = (stripeStatus) =>
  stripeStatus === "canceled" ? "cancelled" : stripeStatus;

// Derives the complete, deterministic MongoDB subscription state from a Stripe
// subscription object. All customer.subscription.* events pass through here so
// state is never patched field-by-field — the entire shape is recomputed from
// Stripe's authoritative object on every delivery.
const resolveSubscriptionState = (stripeSub) => {
  const normStatus = normaliseStatus(stripeSub.status);
  return {
    stripeSubscriptionId: stripeSub.id,
    plan:               ["trialing", "active"].includes(normStatus) ? "premium" : "free",
    status:             normStatus,
    trialStart:         fromStripeTimestamp(stripeSub.trial_start),
    trialEnd:           fromStripeTimestamp(stripeSub.trial_end),
    currentPeriodStart: fromStripeTimestamp(stripeSub.current_period_start),
    currentPeriodEnd:   fromStripeTimestamp(stripeSub.current_period_end),
    cancelAtPeriodEnd:  stripeSub.cancel_at_period_end ?? false,
  };
};

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

    // Reject before touching Stripe if the user already has an active subscription
    if (sub?.stripeSubscriptionId && ["active", "trialing"].includes(sub.status)) {
      throw new AppError("You already have an active subscription.", 409, "ALREADY_SUBSCRIBED");
    }

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

    let setupIntent;
    try {
      setupIntent = await stripeService.createSetupIntent(sub.stripeCustomerId);
    } catch (err) {
      // Stale customer ID in DB (e.g. created in test mode, then switched to live)
      if (err?.code === "resource_missing" && err?.param === "customer") {
        const customer = await stripeService.createCustomer({
          email: user.email,
          name:  `${user.firstName} ${user.lastName ?? ""}`.trim(),
          userId,
        });

        sub = await Subscription.findOneAndUpdate(
          { userId },
          { $set: { stripeCustomerId: customer.id } },
          { new: true }
        );

        logger.info({ event: "stripe_customer_recreated", userId, customerId: customer.id });
        setupIntent = await stripeService.createSetupIntent(sub.stripeCustomerId);
      } else {
        throw err;
      }
    }

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

    // Block all non-expired states — each has the correct recovery path:
    //   active/trialing → already subscribed
    //   past_due        → update payment method via /update-payment/confirm
    //   cancelled       → undo via /reactivate
    if (sub.stripeSubscriptionId && sub.status !== "expired") {
      const msg = {
        active:    "You already have an active subscription.",
        trialing:  "You are currently in a free trial.",
        past_due:  "Payment failed. Please update your payment method to restore access.",
        cancelled: "Your subscription is scheduled to end. Use reactivate to undo cancellation.",
      }[sub.status] ?? "Subscription already exists.";
      throw new AppError(msg, 409, "ALREADY_SUBSCRIBED");
    }

    // Deterministic idempotency key (daily window) — if two requests race,
    // Stripe returns the same subscription object for both, preventing a
    // duplicate Stripe subscription being created for the same user.
    const idempotencyKey = `finchie-activate-${userId}-${new Date().toISOString().slice(0, 10)}`;

    const stripeSub = await stripeService.createSubscription(
      sub.stripeCustomerId,
      env.STRIPE_PRICE_ID,
      30,
      idempotencyKey
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

    // Fire-and-forget: send welcome email
    User.findOne({ userId }, { email: 1, firstName: 1 }).lean().then((user) => {
      if (user) {
        sendSubscriptionActivatedEmail(user.email, user.firstName, {
          trialEnd: updated.trialEnd,
          amount:   3.99,
          currency: "gbp",
        }).catch((err) => logger.warn({ event: "email_send_failed", err: err.message }));
      }
    });

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

    // Fire-and-forget: send cancellation email
    User.findOne({ userId }, { email: 1, firstName: 1 }).lean().then((user) => {
      if (user) {
        sendSubscriptionCancelledEmail(user.email, user.firstName, {
          accessUntil: updated.currentPeriodEnd,
        }).catch((err) => logger.warn({ event: "email_send_failed", err: err.message }));
      }
    });

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

  // GET /subscriptions/payment-method
  getPaymentMethod: async (userId) => {
    assertStripeConfigured();
    const sub = await Subscription.findOne({ userId }).lean();
    if (!sub?.stripeSubscriptionId) return null;
    const pm = await stripeService.getSubscriptionPaymentMethod(sub.stripeSubscriptionId);
    if (!pm || !pm.card) return null;
    return {
      brand:    pm.card.brand,
      last4:    pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear:  pm.card.exp_year,
    };
  },

  // GET /subscriptions/billing-history
  getBillingHistory: async (userId) => {
    assertStripeConfigured();
    const sub = await Subscription.findOne({ userId }).lean();
    if (!sub?.stripeCustomerId) return [];
    const { data: invoices } = await stripeService.listInvoices(sub.stripeCustomerId, 24);
    return invoices.map((inv) => ({
      id:         inv.id,
      number:     inv.number,
      date:       fromStripeTimestamp(inv.created),
      amount:     inv.amount_paid / 100,
      currency:   inv.currency,
      status:     inv.status,
      invoiceUrl: inv.hosted_invoice_url,
      invoicePdf: inv.invoice_pdf,
    }));
  },

  // POST /subscriptions/update-payment/setup
  setupUpdatePayment: async (userId) => {
    assertStripeConfigured();
    const sub = await Subscription.findOne({ userId }).lean();
    if (!sub?.stripeCustomerId) {
      throw new AppError("No payment setup found. Complete initial subscription setup first.", 404, "NOT_FOUND");
    }
    const setupIntent = await stripeService.createSetupIntent(sub.stripeCustomerId);
    return {
      clientSecret:   setupIntent.client_secret,
      publishableKey: env.STRIPE_PUBLISHABLE_KEY ?? "",
    };
  },

  // POST /subscriptions/update-payment/confirm
  confirmUpdatePayment: async (userId, paymentMethodId) => {
    assertStripeConfigured();
    if (!paymentMethodId) throw new AppError("paymentMethodId is required.", 400, "VALIDATION_ERROR");

    const sub = await Subscription.findOne({ userId }).lean();
    if (!sub?.stripeCustomerId) throw new AppError("No subscription found.", 404, "NOT_FOUND");

    await stripeService.updateDefaultPaymentMethod(
      sub.stripeCustomerId,
      sub.stripeSubscriptionId,
      paymentMethodId
    );

    // Get card details to include in email
    const pm   = await stripeService.retrievePaymentMethod(paymentMethodId);
    const user = await User.findOne({ userId }, { email: 1, firstName: 1 }).lean();
    if (user && pm?.card) {
      sendCardUpdatedEmail(user.email, user.firstName, {
        brand: pm.card.brand,
        last4: pm.card.last4,
      }).catch((err) => logger.warn({ event: "email_send_failed", err: err.message }));
    }

    logger.info({ event: "payment_method_updated", userId });
    return { success: true };
  },

  // POST /subscriptions/webhook
  handleWebhookEvent: async (event) => {
    const { type, id: eventId, created } = event;
    const obj = event.data.object;

    // Stripe event timestamps are Unix seconds — convert once.
    const eventCreatedAt = new Date(created * 1000);

    // stateGuard: two-layer protection for state-mutating events.
    //   Layer 1 — idempotency:  same eventId is never processed twice.
    //   Layer 2 — ordering:     out-of-order events with an older timestamp
    //             than the last processed event are silently skipped.
    //             Example: subscription.updated (T+1) arriving after
    //             invoice.payment_failed (T+5) must not overwrite past_due→free
    //             with the earlier stale active state.
    // MongoDB document-level atomicity means only one concurrent write wins —
    // the second delivery sees the eventId already set and gets null back.
    const stateGuard = (customerId) => ({
      stripeCustomerId:  customerId,
      lastStripeEventId: { $ne: eventId },
      $or: [
        { lastStripeEventAt: null },
        { lastStripeEventAt: { $lte: eventCreatedAt } },
      ],
    });

    // emailGuard: idempotency only — no timestamp ordering.
    // Used for email-only events that carry no state change. Applying the
    // timestamp guard here would suppress the email whenever a newer state
    // event has already advanced lastStripeEventAt, which is wrong — the
    // email must be delivered exactly once on first receipt regardless.
    const emailGuard = (customerId) => ({
      stripeCustomerId:  customerId,
      lastStripeEventId: { $ne: eventId },
    });

    const stateMeta = { lastStripeEventId: eventId, lastStripeEventAt: eventCreatedAt };
    const logWarn   = (err) => logger.warn({ event: "email_send_failed", err: err.message });

    switch (type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        // resolveSubscriptionState recomputes the full shape from Stripe's object —
        // no field-by-field patching that could leave plan/status out of sync.
        const state   = resolveSubscriptionState(obj);
        const updated = await Subscription.findOneAndUpdate(
          stateGuard(obj.customer),
          { $set: { ...state, ...stateMeta } }
        );
        if (!updated) logger.info({ event: "stripe_webhook_skipped", eventId, type });
        break;
      }

      // invoice.paid is the current Stripe event name; invoice.payment_succeeded
      // is its legacy alias — Stripe may fire both; handle identically.
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        if (!obj.subscription) break;
        const updatedSub = await Subscription.findOneAndUpdate(
          stateGuard(obj.customer),
          {
            $set: {
              status:             "active",
              plan:               "premium",
              currentPeriodStart: fromStripeTimestamp(obj.period_start),
              currentPeriodEnd:   fromStripeTimestamp(obj.period_end),
              ...stateMeta,
            },
          },
          { new: true }
        );
        if (!updatedSub) { logger.info({ event: "stripe_webhook_skipped", eventId, type }); break; }
        // Skip $0 invoices (trial start) — only send email for real charges.
        if (obj.amount_paid > 0) {
          getUserByCustomerId(obj.customer).then((user) => {
            if (user) {
              sendPaymentSucceededEmail(user.email, user.firstName, {
                amount:          obj.amount_paid / 100,
                currency:        obj.currency,
                invoiceUrl:      obj.hosted_invoice_url,
                nextRenewalDate: updatedSub.currentPeriodEnd,
              }).catch(logWarn);
            }
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        if (!obj.subscription) break;
        // Immediate revoke — no grace period. plan → free so isPremiumActive
        // returns false on the very next request even before the subscription
        // object is updated by a subsequent customer.subscription.updated event.
        const updated = await Subscription.findOneAndUpdate(
          stateGuard(obj.customer),
          { $set: { status: "past_due", plan: "free", ...stateMeta } }
        );
        if (!updated) { logger.info({ event: "stripe_webhook_skipped", eventId, type }); break; }
        logger.warn({ event: "subscription_payment_failed", customerId: obj.customer });
        getUserByCustomerId(obj.customer).then((user) => {
          if (user) sendPaymentFailedEmail(user.email, user.firstName).catch(logWarn);
        });
        break;
      }

      case "customer.subscription.trial_will_end": {
        // Email-only — no state fields change. emailGuard (no timestamp check)
        // ensures delivery even when a newer state event has already run.
        // Only lastStripeEventId is stamped so lastStripeEventAt is not
        // regressed to this earlier event's timestamp.
        const updated = await Subscription.findOneAndUpdate(
          emailGuard(obj.customer),
          { $set: { lastStripeEventId: eventId } }
        );
        if (!updated) { logger.info({ event: "stripe_webhook_skipped", eventId, type }); break; }
        const daysLeft = Math.ceil(
          (fromStripeTimestamp(obj.trial_end) - Date.now()) / 86_400_000
        );
        logger.info({ event: "stripe_trial_will_end", customerId: obj.customer, daysLeft });
        getUserByCustomerId(obj.customer).then((user) => {
          if (user) sendTrialEndingSoonEmail(user.email, user.firstName, daysLeft).catch(logWarn);
        });
        break;
      }

      case "customer.subscription.deleted": {
        // Use resolver for base data (periods, ids) then force terminal state.
        // "expired" is our own sentinel — distinct from "cancelled" — that marks
        // a subscription fully ended with no recovery path except re-subscribing.
        const state   = resolveSubscriptionState(obj);
        const updated = await Subscription.findOneAndUpdate(
          stateGuard(obj.customer),
          { $set: { ...state, status: "expired", plan: "free", ...stateMeta } }
        );
        if (!updated) { logger.info({ event: "stripe_webhook_skipped", eventId, type }); break; }
        getUserByCustomerId(obj.customer).then((user) => {
          if (user) sendSubscriptionExpiredEmail(user.email, user.firstName).catch(logWarn);
        });
        break;
      }

      default:
        logger.info({ event: "stripe_webhook_unhandled", type });
    }
  },
};
