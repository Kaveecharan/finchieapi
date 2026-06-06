import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { subscriptionController } from "../controllers/subscription.controller.js";

const router = Router();

// ── Webhook — no authenticate, raw body already applied in app.js ─────────────
router.post("/webhook", subscriptionController.webhook);

// ── Authenticated routes ───────────────────────────────────────────────────────
router.use(authenticate);

router.get("/me",                          subscriptionController.getMySubscription);
router.get("/config",                      subscriptionController.getConfig);
router.get("/payment-method",              subscriptionController.getPaymentMethod);
router.get("/billing-history",             subscriptionController.getBillingHistory);
router.post("/setup",                      subscriptionController.setup);
router.post("/activate",                   subscriptionController.activate);
router.post("/cancel",                     subscriptionController.cancel);
router.post("/reactivate",                 subscriptionController.reactivate);
router.post("/update-payment/setup",       subscriptionController.setupUpdatePayment);
router.post("/update-payment/confirm",     subscriptionController.confirmUpdatePayment);

export default router;
