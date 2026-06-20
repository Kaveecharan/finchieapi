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
  createSubscription: (customerId, priceId, trialDays = 30, defaultPaymentMethodId, idempotencyKey) =>
    stripe().subscriptions.create(
      {
        customer: customerId,
        items: [{ price: priceId }],
        trial_period_days: trialDays,
        // Explicitly set the payment method so Stripe knows which card to charge
        // at the end of the trial (or immediately for no-trial subscriptions).
        ...(defaultPaymentMethodId ? { default_payment_method: defaultPaymentMethodId } : {}),
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

  payInvoice: (invoiceId, paymentMethodId) =>
    stripe().invoices.pay(invoiceId, paymentMethodId ? { payment_method: paymentMethodId } : {}),

  // Returns the default_payment_method ID for a customer — checks subscription
  // first, then customer invoice_settings, then first attached card.
  getDefaultPaymentMethodId: async (customerId, subscriptionId) => {
    if (subscriptionId) {
      const sub = await stripe().subscriptions.retrieve(subscriptionId, {
        expand: ["default_payment_method"],
      });
      const pm = sub.default_payment_method;
      if (pm) return typeof pm === "string" ? pm : pm.id;
    }
    const customer = await stripe().customers.retrieve(customerId);
    const fromCustomer = customer.invoice_settings?.default_payment_method;
    if (fromCustomer) return typeof fromCustomer === "string" ? fromCustomer : fromCustomer.id;
    // Last resort: first attached card
    const { data: pms } = await stripe().paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
    return pms[0]?.id ?? null;
  },

  // ── Subscription Schedules ────────────────────────────────────────────────
  // Creates a schedule seeded from an existing subscription. Stripe automatically
  // sets phase[0] to mirror the current subscription state and end_date = current_period_end.
  createScheduleFromSubscription: (subscriptionId) =>
    stripe().subscriptionSchedules.create({ from_subscription: subscriptionId }),

  getSchedule: (scheduleId) =>
    stripe().subscriptionSchedules.retrieve(scheduleId),

  // Rewrites the schedule phases: phase 1 keeps the current price until the
  // existing period end; phase 2 starts the new price indefinitely.
  updateSchedulePhase: (scheduleId, currentPriceId, newPriceId, phase1StartDate, phase1EndDate) =>
    stripe().subscriptionSchedules.update(scheduleId, {
      end_behavior: "release",
      phases: [
        {
          start_date: phase1StartDate,
          end_date:   phase1EndDate,
          items:      [{ price: currentPriceId, quantity: 1 }],
        },
        {
          items: [{ price: newPriceId, quantity: 1 }],
        },
      ],
    }),

  // Detaches the schedule from the subscription; the subscription continues
  // as-is with no phase transitions (user cancelled a pending plan change).
  releaseSchedule: (scheduleId) =>
    stripe().subscriptionSchedules.release(scheduleId),

  // ── Webhook ────────────────────────────────────────────────────────────────
  // Requires raw (unparsed) body — registered before express.json() in app.js.
  constructWebhookEvent: (rawBody, signature) => {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new AppError("Stripe webhook secret not configured.", 503, "STRIPE_NOT_CONFIGURED");
    }
    return stripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  },
};
