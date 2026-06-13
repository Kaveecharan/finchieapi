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
  // Returns Stripe publishable key + plan pricing (safe to expose publicly after auth)
  getConfig: asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        publishableKey: env.STRIPE_PUBLISHABLE_KEY,
        plan: {
          name:        "Finchie Premium",
          price:       3.99,
          currency:    "gbp",
          interval:    "month",
          trialDays:   30,
          description: "30-day free trial, then £3.99/month. Cancel anytime.",
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
  // Creates the Stripe subscription (with 30-day trial) after Payment Sheet confirms.
  // Expects { paymentMethodId } in the body — the PM ID from the confirmed SetupIntent.
  activate: asyncHandler(async (req, res) => {
    const { paymentMethodId } = req.body;
    const data = await subscriptionService.activate(req.user.userId, paymentMethodId);
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
