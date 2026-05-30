import * as authService from "../services/auth.service.js";
import { userRepository } from "../repositories/user.repository.js";
import { clearRefreshCookie, setRefreshCookie } from "../utils/cookie.js";
import { SECURITY } from "../config/security.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const deviceInfo = (req) => ({
  ip: req.ip,
  userAgent: req.headers["user-agent"] ?? "",
  deviceId: req.body?.deviceId ?? req.headers["x-device-id"] ?? "",
  platform: req.body?.platform ?? req.headers["x-platform"] ?? "",
  sessionId: req.user?.sessionId, // for authenticated requests
});

// Mobile clients can't reliably use HttpOnly cookies, so we include the
// refresh token in the response body when the request comes from a native app.
const isMobileClient = (req) => {
  const platform = req.body?.platform ?? req.headers["x-platform"] ?? "";
  return ["android", "ios"].includes(platform) || req.headers["x-client-type"] === "mobile";
};

const sendTokens = (res, req, { accessToken, refreshToken, user, mfaRequired, mfaToken }) => {
  if (mfaRequired) {
    return res.json({ mfaRequired: true, mfaToken });
  }
  setRefreshCookie(res, refreshToken);
  const body = { accessToken, user };
  if (isMobileClient(req)) body.refreshToken = refreshToken;
  res.json(body);
};

// ─── Signup ───────────────────────────────────────────────────────────────────

export const signupSendCode = asyncHandler(async (req, res) => {
  await authService.initiateSignup(req.body, req.ip);
  res.json({ message: "Verification code sent to your email." });
});

export const verifySignupCode = asyncHandler(async (req, res) => {
  const result = await authService.verifySignupCode(req.body, deviceInfo(req));
  sendTokens(res, req, result);
});

export const resendVerificationCode = asyncHandler(async (req, res) => {
  await authService.resendVerificationCode(req.body.email, req.ip);
  // Always return success to prevent email enumeration
  res.json({ message: "If that email is pending verification, a new code was sent." });
});

// ─── Login ────────────────────────────────────────────────────────────────────

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, deviceInfo(req));
  sendTokens(res, req, result);
});

export const verifyMfaLogin = asyncHandler(async (req, res) => {
  const result = await authService.verifyMfaLogin(req.body, deviceInfo(req));
  sendTokens(res, req, result);
});

export const googleLogin = asyncHandler(async (req, res) => {
  const { id_token, platform } = req.body;
  const result = await authService.googleLogin({ idToken: id_token, platform }, deviceInfo(req));
  sendTokens(res, req, result);
});

// ─── Token Refresh ────────────────────────────────────────────────────────────

export const refresh = asyncHandler(async (req, res) => {
  // Cookie for web; body fallback for mobile clients that can't persist HttpOnly cookies
  const token = req.cookies[SECURITY.COOKIE_NAME] || req.body?.refreshToken;
  if (!token) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: "No refresh token" });
  }

  const { accessToken, refreshToken } = await authService.refreshTokens(token, deviceInfo(req));
  setRefreshCookie(res, refreshToken);
  const body = { accessToken };
  // Return the new refresh token in the body whenever the client sent one in the body.
  // Mobile clients can't read HttpOnly cookies, so they need it explicitly.
  // Also honour the legacy x-client-type / platform header check as a fallback.
  if (req.body?.refreshToken || isMobileClient(req)) body.refreshToken = refreshToken;
  res.json(body);
});

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user.sessionId, req.user.userId, req.ip);
  clearRefreshCookie(res);
  res.json({ ok: true });
});

export const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutAll(req.user.userId, req.ip);
  clearRefreshCookie(res);
  res.json({ ok: true });
});

// ─── Password Management ──────────────────────────────────────────────────────

export const sendPasswordReset = asyncHandler(async (req, res) => {
  await authService.sendPasswordReset(req.body.email, req.ip);
  res.json({ message: "If that email is registered, a reset code was sent." });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body, req.ip);
  res.json({ message: "Password reset successfully. Please log in." });
});

export const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.userId, req.body, deviceInfo(req));
  clearRefreshCookie(res);
  res.json({ message: "Password changed. Other sessions have been revoked." });
});

// ─── MFA ──────────────────────────────────────────────────────────────────────

export const getMfaSetup = asyncHandler(async (req, res) => {
  const setup = await authService.setupMfa(req.user.userId);
  res.json(setup);
});

export const confirmMfaSetup = asyncHandler(async (req, res) => {
  const { backupCodes } = await authService.confirmMfaSetup(req.user.userId, req.body);
  res.json({
    message: "MFA enabled. Store these backup codes securely — they will not be shown again.",
    backupCodes,
  });
});

export const disableMfa = asyncHandler(async (req, res) => {
  await authService.disableMfa(req.user.userId, req.body);
  res.json({ message: "MFA disabled." });
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const getSessions = asyncHandler(async (req, res) => {
  const sessions = await authService.getSessions(req.user.userId);
  res.json({ sessions });
});

export const revokeSession = asyncHandler(async (req, res) => {
  await authService.revokeSession(req.user.userId, req.params.sessionId, req.ip);
  res.json({ ok: true });
});

// ─── Current User ─────────────────────────────────────────────────────────────

export const me = asyncHandler(async (req, res) => {
  const user = await userRepository.findById(req.user.userId);
  if (!user) return res.status(404).json({ error: "User not found", code: "NOT_FOUND" });
  res.json({ user });
});

// ─── Health ───────────────────────────────────────────────────────────────────

export const healthCheck = (req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
};
