import { asyncHandler } from "../utils/asyncHandler.js";
import { subscriptionService } from "../services/subscription.service.js";
import { stripeService } from "../services/stripe.service.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export const subscriptionController = {
  // GET /subscriptions/me
  // Returns the current user's subscription status + plan
  getMySubscription: asyncHandler(async (req, res) => {
    const data = await subscriptionService.getForUser(req.user.userId);
    res.json({ success: true, data });
  }),

  // GET /subscriptions/config
  // Returns Stripe publishable key + all available plan options.
  getConfig: asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        publishableKey:   env.STRIPE_PUBLISHABLE_KEY,
        turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null,
        plans: {
          monthly: {
            amount:      4.99,
            currency:    "gbp",
            interval:    "month",
            trialDays:   30,
            description: "30-day free trial, then £4.99/month. Cancel anytime.",
          },
          yearly: {
            amount:      34.99,
            currency:    "gbp",
            interval:    "year",
            trialDays:   0,
            description: "£34.99/year. No free trial. Cancel anytime.",
          },
        },
      },
    });
  }),

  // POST /subscriptions/setup
  // Creates a Stripe Customer + SetupIntent; returns client_secret for Payment Sheet
  setup: asyncHandler(async (req, res) => {
    const data = await subscriptionService.setup(req.user.userId);
    res.json({ success: true, data });
  }),

  // POST /subscriptions/activate
  // Creates the Stripe subscription after Payment Sheet confirms.
  // Expects { paymentMethodId, interval } — interval is 'monthly' | 'yearly'.
  activate: asyncHandler(async (req, res) => {
    const { paymentMethodId, interval } = req.body;

    if (!["monthly", "yearly"].includes(interval)) {
      return res.status(400).json({
        success: false,
        error: "interval must be 'monthly' or 'yearly'",
        code:  "VALIDATION_ERROR",
      });
    }

    const data = await subscriptionService.activate(req.user.userId, paymentMethodId, interval);
    res.json({ success: true, data });
  }),

  // POST /subscriptions/plan-change
  schedulePlanChange: asyncHandler(async (req, res) => {
    const { interval } = req.body;
    if (!["monthly", "yearly"].includes(interval)) {
      return res.status(400).json({
        success: false,
        error:   "interval must be 'monthly' or 'yearly'",
        code:    "VALIDATION_ERROR",
      });
    }
    const data = await subscriptionService.schedulePlanChange(req.user.userId, interval);
    res.json({ success: true, data });
  }),

  // DELETE /subscriptions/plan-change
  cancelPlanChange: asyncHandler(async (req, res) => {
    const data = await subscriptionService.cancelPlanChange(req.user.userId);
    res.json({ success: true, data });
  }),

  // POST /subscriptions/cancel
  // Schedules cancellation at end of current billing period
  cancel: asyncHandler(async (req, res) => {
    const data = await subscriptionService.cancel(req.user.userId);
    res.json({ success: true, data });
  }),

  // POST /subscriptions/reactivate
  // Removes the scheduled cancellation
  reactivate: asyncHandler(async (req, res) => {
    const data = await subscriptionService.reactivate(req.user.userId);
    res.json({ success: true, data });
  }),

  // GET /subscriptions/payment-method
  getPaymentMethod: asyncHandler(async (req, res) => {
    const data = await subscriptionService.getPaymentMethod(req.user.userId);
    res.json({ success: true, data });
  }),

  // GET /subscriptions/billing-history
  getBillingHistory: asyncHandler(async (req, res) => {
    const data = await subscriptionService.getBillingHistory(req.user.userId);
    res.json({ success: true, data });
  }),

  // POST /subscriptions/retry-payment
  retryPayment: asyncHandler(async (req, res) => {
    const data = await subscriptionService.retryPayment(req.user.userId);
    res.json({ success: true, data });
  }),

  // POST /subscriptions/update-payment/setup
  setupUpdatePayment: asyncHandler(async (req, res) => {
    const data = await subscriptionService.setupUpdatePayment(req.user.userId);
    res.json({ success: true, data });
  }),

  // POST /subscriptions/update-payment/confirm
  confirmUpdatePayment: asyncHandler(async (req, res) => {
    const { paymentMethodId } = req.body;
    const data = await subscriptionService.confirmUpdatePayment(req.user.userId, paymentMethodId);
    res.json({ success: true, data });
  }),

  // POST /subscriptions/webhook
  // Stripe webhook — must receive raw body (registered before express.json)
  webhook: asyncHandler(async (req, res) => {
    const signature = req.headers["stripe-signature"];

    let event;
    try {
      event = stripeService.constructWebhookEvent(req.body, signature);
    } catch (err) {
      logger.warn({ event: "stripe_webhook_signature_failed", err: err.message });
      return res.status(400).json({ error: "Webhook signature verification failed" });
    }

    await subscriptionService.handleWebhookEvent(event);
    res.json({ received: true });
  }),
};
