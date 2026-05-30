import express from "express";
import { profileController } from "../controllers/profile.controller.js";
import { authenticate } from "../middleware/authenticate.js";
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

router.get("/",              profileController.get);
router.put("/",              validate(updateProfileSchema),  profileController.update);
router.put("/avatar",        validate(updateAvatarSchema),   profileController.updateAvatar);
router.put("/email",         validate(updateEmailSchema),    profileController.updateEmail);
router.put("/phone",         validate(updatePhoneSchema),    profileController.updatePhone);
router.post("/deactivate",   validate(deactivateSchema),     profileController.deactivate);

export default router;
