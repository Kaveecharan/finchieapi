import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { sensitiveLimiter, authUserLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../validators/validate.js";
import { confirmPaymentSchema } from "../validators/subscription.validators.js";
import { subscriptionController } from "../controllers/subscription.controller.js";

const router = Router();

// ── Webhook — no authenticate, raw body already applied in app.js ─────────────
router.post("/webhook", subscriptionController.webhook);

// ── Public routes (no auth required) ─────────────────────────────────────────
// publishableKey and plan info are public by design — no user data exposed.
router.get("/config", subscriptionController.getConfig);

// ── Authenticated routes ───────────────────────────────────────────────────────
// authUserLimiter: per-user cap (20 req/15 min) so one account can't flood the
// subscription API even after passing authentication.
router.use(authenticate, authUserLimiter);

router.get("/me",             subscriptionController.getMySubscription);
router.get("/payment-method", subscriptionController.getPaymentMethod);
router.get("/billing-history", subscriptionController.getBillingHistory);

// sensitiveLimiter: 5 req/hour on state-mutating payment endpoints to prevent
// Stripe customer/subscription creation spam and payment method abuse.
router.post("/setup",    sensitiveLimiter, subscriptionController.setup);
router.post("/activate", sensitiveLimiter, subscriptionController.activate);
router.post("/cancel",                    subscriptionController.cancel);
router.post("/reactivate",                subscriptionController.reactivate);

router.post("/retry-payment",  sensitiveLimiter, subscriptionController.retryPayment);
router.post("/update-payment/setup",   subscriptionController.setupUpdatePayment);
router.post(
  "/update-payment/confirm",
  sensitiveLimiter,
  validate(confirmPaymentSchema),
  subscriptionController.confirmUpdatePayment
);

export default router;
