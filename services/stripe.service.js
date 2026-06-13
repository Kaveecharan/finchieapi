import Stripe from "stripe";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

// ── Lazy singleton ─────────────────────────────────────────────────────────────
// Only instantiated on first use so the app boots normally when Stripe keys
// are absent (subscription endpoints simply return a 503).
let _stripe = null;

const stripe = () => {
  if (_stripe) return _stripe;
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(
      "Stripe is not configured. Add STRIPE_SECRET_KEY to your environment.",
      503,
      "STRIPE_NOT_CONFIGURED"
    );
  }
  _stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  return _stripe;
};

export const stripeService = {
  // ── Customer ───────────────────────────────────────────────────────────────
  createCustomer: ({ email, name, userId }) =>
    stripe().customers.create({ email, name, metadata: { userId } }),

  // ── SetupIntent — collect card without an immediate charge ────────────────
  createSetupIntent: (customerId) =>
    stripe().setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
    }),

  // ── Subscription ───────────────────────────────────────────────────────────
  createSubscription: (customerId, priceId, trialDays = 30, idempotencyKey) =>
    stripe().subscriptions.create(
      {
        customer: customerId,
        items: [{ price: priceId }],
        trial_period_days: trialDays,
        payment_settings: {
          payment_method_types: ["card"],
          save_default_payment_method: "on_subscription",
        },
        expand: ["latest_invoice.payment_intent"],
      },
      idempotencyKey ? { idempotencyKey } : undefined
    ),

  cancelAtPeriodEnd: (subscriptionId) =>
    stripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true }),

  reactivate: (subscriptionId) =>
    stripe().subscriptions.update(subscriptionId, { cancel_at_period_end: false }),

  retrieve: (subscriptionId) =>
    stripe().subscriptions.retrieve(subscriptionId),

  // ── Payment Method ─────────────────────────────────────────────────────────
  // Retrieve the default payment method attached to a subscription, expanded.
  getSubscriptionPaymentMethod: async (subscriptionId) => {
    const sub = await stripe().subscriptions.retrieve(subscriptionId, {
      expand: ["default_payment_method"],
    });
    return sub.default_payment_method ?? null;
  },

  retrievePaymentMethod: (paymentMethodId) =>
    stripe().paymentMethods.retrieve(paymentMethodId),

  // Update default payment method on both the customer and the subscription.
  updateDefaultPaymentMethod: async (customerId, subscriptionId, paymentMethodId) => {
    await stripe().customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    if (subscriptionId) {
      await stripe().subscriptions.update(subscriptionId, {
        default_payment_method: paymentMethodId,
      });
    }
  },

  // ── Invoices ───────────────────────────────────────────────────────────────
  listInvoices: (customerId, limit = 24) =>
    stripe().invoices.list({ customer: customerId, limit }),

  listOpenInvoices: (customerId) =>
    stripe().invoices.list({ customer: customerId, status: "open", limit: 5 }),

  payInvoice: (invoiceId) =>
    stripe().invoices.pay(invoiceId),

  // ── Webhook ────────────────────────────────────────────────────────────────
  // Requires raw (unparsed) body — registered before express.json() in app.js.
  constructWebhookEvent: (rawBody, signature) => {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new AppError("Stripe webhook secret not configured.", 503, "STRIPE_NOT_CONFIGURED");
    }
    return stripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  },
};
