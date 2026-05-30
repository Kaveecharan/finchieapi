export const SECURITY = Object.freeze({
  BCRYPT_ROUNDS: 12,

  PASSWORD: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 128,
    // Storing last N hashes prevents users from cycling back to old passwords
    HISTORY_LIMIT: 5,
  },

  VERIFICATION_CODE: {
    EXPIRY_MS: 10 * 60 * 1000,
    // Limit attempts to prevent brute-forcing the 6-digit space (1M possibilities)
    MAX_ATTEMPTS: 5,
  },

  BRUTE_FORCE: {
    MAX_ATTEMPTS: 5,
    LOCK_DURATION_MS: 30 * 60 * 1000,
    ATTEMPT_WINDOW_MS: 15 * 60 * 1000,
  },

  SESSION: {
    // Hard cap on concurrent sessions prevents silent token hoarding after account compromise
    MAX_ACTIVE: 5,
    REFRESH_TOKEN_TTL_DAYS: 7,
  },

  TOTP: {
    // window: 1 allows ±30s clock skew without weakening security meaningfully
    WINDOW: 1,
    BACKUP_CODE_COUNT: 8,
  },

  COOKIE_NAME: "rt",

  RATE_LIMITS: {
    GLOBAL: { windowMs: 15 * 60 * 1000, max: 200 },
    AUTH: { windowMs: 15 * 60 * 1000, max: 20 },
    SENSITIVE: { windowMs: 60 * 60 * 1000, max: 5 },
  },
});
