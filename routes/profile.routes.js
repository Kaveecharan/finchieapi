import express from "express";
import { profileController } from "../controllers/profile.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { sensitiveLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../validators/validate.js";
import {
  updateProfileSchema,
  updateAvatarSchema,
  updateEmailSchema,
  updatePhoneSchema,
  deactivateSchema,
} from "../validators/profile.validators.js";

const router = express.Router();
router.use(authenticate);

router.get("/",    profileController.get);
router.put("/",    validate(updateProfileSchema), profileController.update);
router.put("/avatar", validate(updateAvatarSchema), profileController.updateAvatar);

// OTP-generating endpoints: rate-limited to 5/hour to prevent code-spam abuse
router.put("/email",  sensitiveLimiter, validate(updateEmailSchema), profileController.updateEmail);
router.put("/phone",  sensitiveLimiter, validate(updatePhoneSchema), profileController.updatePhone);
router.post("/deactivate", sensitiveLimiter, validate(deactivateSchema), profileController.deactivate);

export default router;
