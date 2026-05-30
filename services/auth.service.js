import { userRepository } from "../repositories/user.repository.js";
import { sessionRepository } from "../repositories/session.repository.js";
import { createSession, issueRotatedTokens, rotateSession } from "./token.service.js";
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  isPasswordReused,
  getDummyHash,
} from "../security/password.js";
import {
  generateMfaSetup,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
  findBackupCode,
} from "./mfa.service.js";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendSecurityAlertEmail,
} from "./email.service.js";
import { generateCode, hmacSha256, timingSafeCompare } from "../utils/crypto.js";
import { SECURITY } from "../config/security.js";
import { env } from "../config/env.js";
import { getRedis } from "../config/redis.js";
import { auditLog, AUDIT } from "../security/audit.js";
import { logger } from "../utils/logger.js";
import { generateUsername } from "../utils/generateUsername.js";
import {
  AuthError,
  ConflictError,
  NotFoundError,
  ValidationError,
  AccountLockedError,
  AppError,
} from "../errors/AppError.js";
import { OAuth2Client } from "google-auth-library";

// ─── Brute Force Protection ───────────────────────────────────────────────────

const bfKey = (email, ip) => `bf:${email.toLowerCase()}:${ip}`;
const bfUserKey = (email) => `bf_user:${email.toLowerCase()}`;

const checkAndRecordFailedAttempt = async (email, ip) => {
  const redis = getRedis();
  if (!redis) return;
  const ipKey = bfKey(email, ip);
  const userKey = bfUserKey(email);
  const ttlSecs = Math.ceil(SECURITY.BRUTE_FORCE.ATTEMPT_WINDOW_MS / 1000);

  const [ipCount, userCount] = await Promise.all([
    redis.incr(ipKey),
    redis.incr(userKey),
  ]);

  await Promise.all([
    redis.expire(ipKey, ttlSecs),
    redis.expire(userKey, ttlSecs),
  ]);

  if (ipCount >= SECURITY.BRUTE_FORCE.MAX_ATTEMPTS || userCount >= SECURITY.BRUTE_FORCE.MAX_ATTEMPTS) {
    const lockTtl = Math.ceil(SECURITY.BRUTE_FORCE.LOCK_DURATION_MS / 1000);
    await Promise.all([
      redis.setex(`lock:${email.toLowerCase()}`, lockTtl, "1"),
    ]);
    auditLog(AUDIT.ACCOUNT_LOCKED, { email, ip });
    throw new AccountLockedError(lockTtl);
  }
};

const isAccountLocked = async (email) => {
  const redis = getRedis();
  if (!redis) return;
  const ttl = await redis.ttl(`lock:${email.toLowerCase()}`);
  if (ttl > 0) throw new AccountLockedError(ttl);
};

const clearBruteForce = async (email, ip) => {
  const redis = getRedis();
  if (!redis) return;
  await Promise.all([
    redis.del(bfKey(email, ip)),
    redis.del(bfUserKey(email)),
    redis.del(`lock:${email.toLowerCase()}`),
  ]);
};

// ─── Code Hashing ─────────────────────────────────────────────────────────────

// HMAC-keyed hash: even with full DB access, rainbow tables for codes are useless
// because the key (BCRYPT_PEPPER) is not in the DB
const hashCode = (code) => hmacSha256(code, env.BCRYPT_PEPPER);

// ─── MFA Challenge Store (Redis) ─────────────────────────────────────────────

const MFA_CHALLENGE_TTL = 300; // 5 minutes

const storeMfaChallenge = async (token, data) => {
  const redis = getRedis();
  if (!redis) throw new AppError("MFA temporarily unavailable", 503, "SERVICE_UNAVAILABLE");
  await redis.setex(`mfa:${token}`, MFA_CHALLENGE_TTL, JSON.stringify(data));
};

const consumeMfaChallenge = async (token) => {
  const redis = getRedis();
  if (!redis) throw new AppError("MFA temporarily unavailable", 503, "SERVICE_UNAVAILABLE");
  const raw = await redis.getdel(`mfa:${token}`);
  if (!raw) return null;
  return JSON.parse(raw);
};

// ─── Google OAuth Client ──────────────────────────────────────────────────────
// @react-native-google-signin configured with webClientId always returns ID
// tokens whose audience is the web client, regardless of native platform.
const googleWebClient = env.GOOGLE_WEB_CLIENT_ID
  ? new OAuth2Client(env.GOOGLE_WEB_CLIENT_ID)
  : null;

// ─── Service Methods ──────────────────────────────────────────────────────────

export const initiateSignup = async ({ email, password, firstName }, ip) => {
  const lowerEmail = email.toLowerCase().trim();

  const policyErrors = validatePasswordPolicy(password);
  if (policyErrors.length) throw new ValidationError("Password policy violation", policyErrors);

  const existing = await userRepository.findByEmail(lowerEmail);
  if (existing?.isEmailVerified) {
    if (existing.oauthOnly) {
      throw new ConflictError("This email is registered with Google. Please sign in with Google instead.");
    }
    throw new ConflictError("Email already registered");
  }

  const passwordHash = await hashPassword(password);
  const code = generateCode(6);
  const codeHash = hashCode(code);
  const codeExpires = new Date(Date.now() + SECURITY.VERIFICATION_CODE.EXPIRY_MS);

  if (existing) {
    if (existing.oauthOnly) {
      throw new ConflictError("This email is registered with Google. Please sign in with Google instead.");
    }
    existing.passwordHash = passwordHash;
    existing.firstName = firstName.trim();
    existing.verificationCodeHash = codeHash;
    existing.verificationCodeExpires = codeExpires;
    existing.verificationAttempts = 0;
    await userRepository.save(existing);
  } else {
    const username = await generateUsername(firstName);

    await userRepository.create({
      email: lowerEmail,
      passwordHash,
      firstName: firstName.trim(),
      displayName: firstName.trim(),
      username,
      verificationCodeHash: codeHash,
      verificationCodeExpires: codeExpires,
    });
  }

  await sendVerificationEmail(lowerEmail, firstName, code);
  auditLog(AUDIT.SIGNUP, { email: lowerEmail, ip });
};

export const verifySignupCode = async ({ email, code }, deviceInfo) => {
  const lowerEmail = email.toLowerCase().trim();

  // Fetch with secrets so we can read verificationCodeHash for comparison.
  const user = await userRepository.findByEmailWithSecrets(lowerEmail);

  // Enumeration-safe: same error regardless of whether the user exists or is already verified.
  if (!user || user.isEmailVerified) {
    throw new AuthError("Invalid or expired verification code");
  }

  if (user.verificationAttempts >= SECURITY.VERIFICATION_CODE.MAX_ATTEMPTS) {
    throw new AccountLockedError(600);
  }

  const expired = !user.verificationCodeExpires || Date.now() > user.verificationCodeExpires;
  const valid = !expired && timingSafeCompare(user.verificationCodeHash, hashCode(code));

  if (!valid) {
    // Atomic $inc prevents TOCTOU races on the attempt counter.
    await userRepository.incrementVerificationAttempts(user._id);
    throw new AuthError("Invalid or expired verification code");
  }

  // Defensive guard: every user created by initiateSignup gets a userId via the
  // Mongoose default (uuidv4). If it's missing, the document was corrupted or
  // created by a different code path. Fail loudly rather than propagating undefined
  // into the Session model where it surfaces as a cryptic validation error.
  if (!user.userId) {
    logger.error({ event: "verify_signup_missing_userId", email: lowerEmail });
    throw new AppError(
      "Account setup is incomplete. Please start the sign-up process again.",
      500,
      "ACCOUNT_SETUP_ERROR"
    );
  }

  // ── Atomic update ────────────────────────────────────────────────────────────
  // findByIdAndUpdate + { new: true } returns a guaranteed-fresh document
  // straight from MongoDB — no Mongoose in-memory state artifacts. This is
  // critical: previous code used document.save() and then passed the same
  // in-memory object to createSession, where user.userId sometimes appeared
  // undefined because Mongoose's modified-paths tracking interacted badly with
  // the $unset of verificationCodeHash on an immutable-field document.
  const verifiedUser = await userRepository.markEmailVerified(user._id);

  if (!verifiedUser) {
    // findByIdAndUpdate returns null if no document matched — should never happen
    // at this point since we just retrieved the user above.
    logger.error({ event: "markEmailVerified_returned_null", email: lowerEmail });
    throw new AppError("Verification failed unexpectedly. Please try again.", 500, "VERIFICATION_FAILED");
  }

  const tokens = await createSession(verifiedUser, deviceInfo);
  auditLog(AUDIT.EMAIL_VERIFIED, { userId: verifiedUser.userId, ip: deviceInfo.ip });

  return { ...tokens, user: publicProfile(verifiedUser) };
};

export const resendVerificationCode = async (email, ip) => {
  const lowerEmail = email.toLowerCase().trim();
  const user = await userRepository.findByEmailWithSecrets(lowerEmail);

  // Always succeed to prevent enumeration
  if (!user || user.isEmailVerified) return;

  const code = generateCode(6);
  user.verificationCodeHash = hashCode(code);
  user.verificationCodeExpires = new Date(Date.now() + SECURITY.VERIFICATION_CODE.EXPIRY_MS);
  user.verificationAttempts = 0;
  await userRepository.save(user);

  await sendVerificationEmail(lowerEmail, user.firstName, code);
};

export const login = async ({ email, password }, deviceInfo) => {
  const lowerEmail = email.toLowerCase().trim();
  const ip = deviceInfo.ip;

  await isAccountLocked(lowerEmail);

  const user = await userRepository.findByEmailWithSecrets(lowerEmail);

  if (!user) {
    await verifyPassword(password, await getDummyHash());
    await checkAndRecordFailedAttempt(lowerEmail, ip);
    auditLog(AUDIT.LOGIN_FAILED, { email: lowerEmail, ip, reason: "user_not_found" });
    throw new AuthError("Invalid credentials");
  }

  // Block password login for Google-only accounts — do not reveal via timing
  if (user.oauthOnly) {
    throw new AuthError("This account was created with Google Sign-In. Please sign in with Google instead.");
  }

  if (!user.passwordHash) {
    await verifyPassword(password, await getDummyHash());
    await checkAndRecordFailedAttempt(lowerEmail, ip);
    auditLog(AUDIT.LOGIN_FAILED, { email: lowerEmail, ip, reason: "no_password" });
    throw new AuthError("Invalid credentials");
  }

  if (!user.isEmailVerified) {
    throw new AuthError("Email not verified");
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    await checkAndRecordFailedAttempt(lowerEmail, ip);
    auditLog(AUDIT.LOGIN_FAILED, { userId: user.userId, ip, reason: "wrong_password" });
    throw new AuthError("Invalid credentials");
  }

  await clearBruteForce(lowerEmail, ip);

  if (user.mfaEnabled) {
    // Issue a short-lived challenge token; full session created only after TOTP verified
    const { randomUUID } = await import("crypto");
    const challengeToken = randomUUID();
    await storeMfaChallenge(challengeToken, { userId: user.userId, deviceInfo });
    return { mfaRequired: true, mfaToken: challengeToken };
  }

  const tokens = await createSession(user, deviceInfo);
  auditLog(AUDIT.LOGIN_SUCCESS, { userId: user.userId, ip });
  return { ...tokens, user: publicProfile(user) };
};

export const verifyMfaLogin = async ({ mfaToken, code, backupCode }, deviceInfo) => {
  const challenge = await consumeMfaChallenge(mfaToken);
  if (!challenge) throw new AuthError("MFA challenge expired or invalid");

  const user = await userRepository.findByIdWithSecrets(challenge.userId);
  if (!user) throw new AuthError("User not found");

  if (code) {
    // Prevent replay: the same TOTP code must not be accepted twice within its window.
    // A 90-second TTL covers the current window plus one on each side (clock skew).
    const redis = getRedis();
    if (redis) {
      const replayKey = `totp_used:${user.userId}:${code}`;
      const alreadyUsed = await redis.get(replayKey);
      if (alreadyUsed) {
        auditLog(AUDIT.MFA_FAILED, { userId: user.userId, ip: deviceInfo.ip, reason: "totp_replay" });
        throw new AuthError("TOTP code already used. Wait for the next code.");
      }
      // Mark before verifying — prevents a race where two concurrent requests both pass
      await redis.setex(replayKey, 90, "1");
    }
    if (!verifyTotp(code, user.mfaSecret)) {
      auditLog(AUDIT.MFA_FAILED, { userId: user.userId, ip: deviceInfo.ip });
      throw new AuthError("Invalid TOTP code");
    }
  } else if (backupCode) {
    const idx = findBackupCode(backupCode, user.mfaBackupCodes);
    if (idx === -1) {
      auditLog(AUDIT.MFA_FAILED, { userId: user.userId, ip: deviceInfo.ip, type: "backup" });
      throw new AuthError("Invalid backup code");
    }
    // Consume the backup code — it's single-use
    user.mfaBackupCodes.splice(idx, 1);
    await userRepository.save(user);
    auditLog(AUDIT.BACKUP_CODE_USED, { userId: user.userId, ip: deviceInfo.ip });
  } else {
    throw new ValidationError("Provide either a TOTP code or a backup code");
  }

  const tokens = await createSession(user, deviceInfo);
  auditLog(AUDIT.MFA_VERIFIED, { userId: user.userId, ip: deviceInfo.ip });
  return { ...tokens, user: publicProfile(user) };
};

export const googleLogin = async ({ idToken, platform }, deviceInfo) => {
  if (!googleWebClient) throw new AppError("Google OAuth not configured", 500, "OAUTH_MISCONFIGURED");

  let googlePayload;
  try {
    const ticket = await googleWebClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_WEB_CLIENT_ID,
    });
    googlePayload = ticket.getPayload();
  } catch {
    throw new AuthError("Invalid Google token");
  }

  const { sub: googleId, email, name } = googlePayload;
  if (!email) throw new AuthError("Google account has no email");

  const lowerEmail = email.toLowerCase();

  let user = await userRepository.findByGoogleId(googleId);
  if (!user) {
    user = await userRepository.findByEmail(lowerEmail);
    if (user) {
      if (!user.oauthOnly) {
        throw new ConflictError("Account already exists with email/password. Please log in using your password.");
      }
      user.googleId = googleId;
      if (!user.isEmailVerified) user.isEmailVerified = true;
      await userRepository.save(user);
    } else {
      const firstName = name || "User";
      const username = await generateUsername(firstName);
      user = await userRepository.create({
        email: lowerEmail,
        firstName,
        displayName: firstName,
        username,
        googleId,
        isEmailVerified: true,
        oauthOnly: true,
      });
    }
  }

  const tokens = await createSession(user, deviceInfo);
  auditLog(AUDIT.OAUTH_LOGIN, { userId: user.userId, provider: "google", ip: deviceInfo.ip });
  return { ...tokens, user: publicProfile(user) };
};

export const refreshTokens = async (rawRefreshToken, deviceInfo) => {
  const { session, payload } = await rotateSession(rawRefreshToken, deviceInfo);

  const user = await userRepository.findById(payload.sub);
  if (!user) throw new AuthError("User not found");

  // Detect if password was changed after this session was created
  if (session.passwordVersion < user.passwordVersion) {
    await sessionRepository.revokeSession(session.sessionId, "password_changed");
    throw new AuthError("Session invalidated — please log in again");
  }

  return issueRotatedTokens(user, session, deviceInfo);
};

export const logout = async (sessionId, userId, ip) => {
  await sessionRepository.revokeSession(sessionId, "logout");
  auditLog(AUDIT.LOGOUT, { userId, sessionId, ip });
};

export const logoutAll = async (userId, ip) => {
  await sessionRepository.revokeAllForUser(userId, "logout_all");
  auditLog(AUDIT.LOGOUT_ALL, { userId, ip });
};

export const sendPasswordReset = async (email, ip) => {
  const lowerEmail = email.toLowerCase().trim();
  const user = await userRepository.findByEmailWithSecrets(lowerEmail);

  // Always return success to prevent email enumeration
  if (!user || !user.isEmailVerified) return;

  const code = generateCode(6);
  user.resetCodeHash = hashCode(code);
  user.resetCodeExpires = new Date(Date.now() + SECURITY.VERIFICATION_CODE.EXPIRY_MS);
  user.resetAttempts = 0; // fresh code — reset counter so previous failed attempts don't carry over
  await userRepository.save(user);

  await sendPasswordResetEmail(lowerEmail, user.firstName, code);
};

export const resetPassword = async ({ email, code, newPassword }, ip) => {
  const lowerEmail = email.toLowerCase().trim();

  const policyErrors = validatePasswordPolicy(newPassword);
  if (policyErrors.length) throw new ValidationError("Password policy violation", policyErrors);

  const user = await userRepository.findByEmailWithSecrets(lowerEmail);
  if (!user || !user.isEmailVerified) throw new AuthError("Invalid or expired code");

  // Brute-force guard: IP-only rate limiting is bypassable with IP rotation.
  // Per-user attempt counter locks the code after 5 failures regardless of IP.
  if ((user.resetAttempts ?? 0) >= SECURITY.VERIFICATION_CODE.MAX_ATTEMPTS) {
    throw new AccountLockedError(600);
  }

  const expired = !user.resetCodeExpires || Date.now() > user.resetCodeExpires;
  const valid = !expired && timingSafeCompare(user.resetCodeHash, hashCode(code));
  if (!valid) {
    await userRepository.incrementResetAttempts(user._id);
    throw new AuthError("Invalid or expired code");
  }

  if (await isPasswordReused(newPassword, user.passwordHistory)) {
    throw new ValidationError("Password was used recently — choose a different one");
  }

  // Add current hash to history before replacing
  const updatedHistory = [user.passwordHash, ...(user.passwordHistory || [])]
    .slice(0, SECURITY.PASSWORD.HISTORY_LIMIT);

  user.passwordHash = await hashPassword(newPassword);
  user.passwordHistory = updatedHistory;
  user.passwordVersion += 1;
  user.resetCodeHash = undefined;
  user.resetCodeExpires = undefined;
  user.resetAttempts = 0;
  await userRepository.save(user);

  // Invalidate all sessions after password reset
  await sessionRepository.revokeAllForUser(user.userId, "password_reset");

  auditLog(AUDIT.PASSWORD_RESET, { userId: user.userId, ip });
};

export const changePassword = async (userId, { currentPassword, newPassword }, deviceInfo) => {
  const user = await userRepository.findByIdWithSecrets(userId);
  if (!user) throw new NotFoundError();
  if (!user.passwordHash) throw new AuthError("Cannot change password for OAuth accounts");

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw new AuthError("Current password is incorrect");

  const policyErrors = validatePasswordPolicy(newPassword);
  if (policyErrors.length) throw new ValidationError("Password policy violation", policyErrors);

  if (await isPasswordReused(newPassword, user.passwordHistory)) {
    throw new ValidationError("Password was used recently — choose a different one");
  }

  const updatedHistory = [user.passwordHash, ...(user.passwordHistory || [])]
    .slice(0, SECURITY.PASSWORD.HISTORY_LIMIT);

  user.passwordHash = await hashPassword(newPassword);
  user.passwordHistory = updatedHistory;
  user.passwordVersion += 1;
  await userRepository.save(user);

  // Revoke all other sessions — user keeps current session
  await sessionRepository.revokeAllForUserExcept(userId, deviceInfo.sessionId, "password_changed");

  await sendSecurityAlertEmail(
    user.email,
    user.firstName,
    "Your password was changed. If this wasn't you, secure your account immediately."
  );

  auditLog(AUDIT.PASSWORD_CHANGED, { userId, ip: deviceInfo.ip });
};

export const setupMfa = async (userId) => {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError();
  if (user.mfaEnabled) throw new ConflictError("MFA already enabled");

  const setup = await generateMfaSetup(user);

  // Store the pending secret server-side so confirmMfaSetup never needs to
  // accept it from the client body. A client-supplied secret would let an
  // authenticated attacker substitute their own, silently hijacking MFA.
  const redis = getRedis();
  if (!redis) throw new AppError("MFA temporarily unavailable", 503, "SERVICE_UNAVAILABLE");
  await redis.setex(`mfa_setup:${userId}`, MFA_CHALLENGE_TTL, setup.secret);

  // Return the secret so the user can manually enter it into their authenticator
  // if QR scanning fails — it's ephemeral, never persisted to the DB until confirmed.
  return setup;
};

export const confirmMfaSetup = async (userId, { code }) => {
  // Retrieve the server-generated secret — never accept from client body.
  const redis = getRedis();
  if (!redis) throw new AppError("MFA temporarily unavailable", 503, "SERVICE_UNAVAILABLE");

  const secret = await redis.getdel(`mfa_setup:${userId}`);
  if (!secret) throw new AuthError("MFA setup session expired. Please start again.");

  if (!verifyTotp(code, secret)) throw new AuthError("Invalid TOTP code");

  const user = await userRepository.findByIdWithSecrets(userId);
  if (!user) throw new NotFoundError();

  const backupCodes = generateBackupCodes();
  user.mfaEnabled = true;
  user.mfaSecret = secret;
  user.mfaBackupCodes = backupCodes.map(hashBackupCode);
  await userRepository.save(user);

  auditLog(AUDIT.MFA_ENABLED, { userId });
  return { backupCodes }; // Shown to user once; plaintext never stored
};

export const disableMfa = async (userId, { password }) => {
  const user = await userRepository.findByIdWithSecrets(userId);
  if (!user) throw new NotFoundError();
  if (!user.passwordHash) throw new AuthError("Cannot verify identity for OAuth accounts");

  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AuthError("Incorrect password");
  }

  user.mfaEnabled = false;
  user.mfaSecret = undefined;
  user.mfaBackupCodes = [];
  await userRepository.save(user);

  auditLog(AUDIT.MFA_DISABLED, { userId });
};

export const getSessions = (userId) =>
  sessionRepository.findActiveByUserId(userId);

export const revokeSession = async (userId, sessionId, ip) => {
  const sessions = await sessionRepository.findActiveByUserId(userId);
  const session = sessions.find((s) => s.sessionId === sessionId);
  if (!session) throw new NotFoundError("Session not found");
  await sessionRepository.revokeSession(sessionId, "user_revoked");
  auditLog(AUDIT.SESSION_REVOKED, { userId, sessionId, ip });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const publicProfile = (user) => ({
  userId:         user.userId,
  email:          user.email,
  firstName:      user.firstName,
  lastName:       user.lastName,
  username:       user.username,
  displayName:    user.displayName,
  avatarUrl:      user.avatarUrl,
  bannerUrl:      user.bannerUrl,
  bio:            user.bio,
  website:        user.website,
  isVerified:     user.isVerified,
  isEmailVerified: user.isEmailVerified,
  roles:          user.roles,
  mfaEnabled:     user.mfaEnabled,
  followersCount: user.followersCount,
  followingCount: user.followingCount,
  postsCount:     user.postsCount,
});
