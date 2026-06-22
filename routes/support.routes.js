import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../validators/validate.js";
import { submitSupportSchema, webContactSchema } from "../validators/support.validators.js";
import { supportController } from "../controllers/support.controller.js";
import { verifyTurnstile } from "../middleware/turnstile.js";
import { sensitiveLimiter } from "../middleware/rateLimiter.js";

const router = Router();

// Public — website contact form (no auth required)
router.post("/web-contact", sensitiveLimiter, verifyTurnstile, validate(webContactSchema), supportController.webContact);

// Authenticated app routes
router.use(authenticate);
router.post("/contact", verifyTurnstile, validate(submitSupportSchema), supportController.contact);

export default router;
