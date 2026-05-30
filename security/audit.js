import { logger } from "../utils/logger.js";

export const AUDIT = Object.freeze({
  LOGIN_SUCCESS: "auth.login.success",
  LOGIN_FAILED: "auth.login.failed",
  LOGIN_BLOCKED: "auth.login.blocked",
  LOGOUT: "auth.logout",
  LOGOUT_ALL: "auth.logout_all",
  SIGNUP: "auth.signup",
  EMAIL_VERIFIED: "auth.email_verified",
  PASSWORD_CHANGED: "auth.password_changed",
  PASSWORD_RESET: "auth.password_reset",
  TOKEN_REFRESHED: "auth.token_refreshed",
  TOKEN_REPLAY: "auth.token_replay_detected",
  MFA_ENABLED: "auth.mfa_enabled",
  MFA_DISABLED: "auth.mfa_disabled",
  MFA_VERIFIED: "auth.mfa_verified",
  MFA_FAILED: "auth.mfa_failed",
  BACKUP_CODE_USED: "auth.backup_code_used",
  SESSION_CREATED: "auth.session_created",
  SESSION_REVOKED: "auth.session_revoked",
  ACCOUNT_LOCKED: "auth.account_locked",
  OAUTH_LOGIN: "auth.oauth_login",
  SUSPICIOUS_ACTIVITY: "auth.suspicious_activity",
});

/**
 * @param {string} event - AUDIT constant
 * @param {{ userId?: string, ip?: string, requestId?: string, [key: string]: any }} data
 */
export const auditLog = (event, data = {}) => {
  logger.info({ ...data, event, _audit: true });
};
