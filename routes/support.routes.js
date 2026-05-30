import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../validators/validate.js";
import { submitSupportSchema } from "../validators/support.validators.js";
import { supportController } from "../controllers/support.controller.js";
import { verifyTurnstile } from "../middleware/turnstile.js";

const router = Router();

router.use(authenticate);
router.post("/contact", verifyTurnstile, validate(submitSupportSchema), supportController.contact);

export default router;
