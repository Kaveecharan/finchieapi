import express from "express";
import * as ctrl from "../controllers/auth.controller.js";
import { authenticate, authorize } from "../middleware/authenticate.js";
import { authLimiter, sensitiveLimiter, authUserLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../validators/validate.js";
import * as v from "../validators/auth.validators.js";
import { verifyTurnstile } from "../middleware/turnstile.js";

const router = express.Router();

// ─── Public ───────────────────────────────────────────────────────────────────

router.get("/health", ctrl.healthCheck);

// Signup — rate-limited tightly to prevent mass account creation
router.post("/signup/send-code", sensitiveLimiter, verifyTurnstile, validate(v.signupSendCodeSchema), ctrl.signupSendCode);
router.post("/signup/verify-code", sensitiveLimiter, validate(v.verifySignupCodeSchema), ctrl.verifySignupCode);
router.post("/signup/resend-code", sensitiveLimiter, validate(v.resendCodeSchema), ctrl.resendVerificationCode);

// Login
router.post("/login", authLimiter, validate(v.loginSchema), ctrl.login);
router.post("/mfa/verify", authLimiter, validate(v.mfaVerifySchema), ctrl.verifyMfaLogin);
router.post("/oauth/google", authLimiter, validate(v.googleLoginSchema), ctrl.googleLogin);

// Token refresh — cookie path is /auth/refresh, so only this endpoint receives the cookie
router.post("/refresh", authLimiter, ctrl.refresh);

// Password recovery — highly rate-limited (prevents code spray attacks)
router.post("/password/forgot", sensitiveLimiter, validate(v.forgotPasswordSchema), ctrl.sendPasswordReset);
router.post("/password/reset", sensitiveLimiter, validate(v.resetPasswordSchema), ctrl.resetPassword);

// ─── Authenticated ────────────────────────────────────────────────────────────

router.get("/me", authenticate, ctrl.me);

router.post("/logout", authenticate, ctrl.logout);
router.post("/logout/all", authenticate, ctrl.logoutAll);

router.post("/password/change", authenticate, authUserLimiter, validate(v.changePasswordSchema), ctrl.changePassword);

// MFA management
router.get("/mfa/setup", authenticate, ctrl.getMfaSetup);
router.post("/mfa/setup/confirm", authenticate, validate(v.mfaConfirmSchema), ctrl.confirmMfaSetup);
router.post("/mfa/disable", authenticate, validate(v.disableMfaSchema), ctrl.disableMfa);

// Session management
router.get("/sessions", authenticate, ctrl.getSessions);
router.delete("/sessions/:sessionId", authenticate, ctrl.revokeSession);

// ─── Admin ────────────────────────────────────────────────────────────────────

router.delete("/admin/sessions/:userId", authenticate, authorize("admin", "superAdmin"), async (req, res, next) => {
  try {
    const { sessionRepository } = await import("../repositories/session.repository.js");
    await sessionRepository.revokeAllForUser(req.params.userId, "admin_revoked");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
