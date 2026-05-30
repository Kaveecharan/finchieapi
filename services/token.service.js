import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { SECURITY } from "../config/security.js";
import { generateUUID, hashForStorage, timingSafeCompare } from "../utils/crypto.js";
import { sessionRepository } from "../repositories/session.repository.js";
import { AuthError } from "../errors/AppError.js";
import { logger } from "../utils/logger.js";
import { auditLog, AUDIT } from "../security/audit.js";

const REFRESH_TTL_MS = (env.REFRESH_TOKEN_TTL_DAYS ?? SECURITY.SESSION.REFRESH_TOKEN_TTL_DAYS) * 24 * 60 * 60 * 1000;
const REFRESH_TTL_SECS = REFRESH_TTL_MS / 1000;

const jwtBaseOptions = {
  algorithm: "HS256",
  issuer: "kodeum",
};

export const signAccessToken = (user, sessionId) =>
  jwt.sign(
    {
      sub: user.userId,
      roles: user.roles,
      sid: sessionId,
      // Password version travels in the token so controllers/services can detect
      // stale tokens after a password change without a DB lookup on every request
      pwv: user.passwordVersion,
    },
    env.JWT_ACCESS_SECRET,
    { ...jwtBaseOptions, expiresIn: env.ACCESS_TOKEN_TTL, audience: "kodeum-app" }
  );

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
    issuer: "kodeum",
    audience: "kodeum-app",
  });

/**
 * Creates a new session (new family) and returns access + refresh tokens.
 * Called on first login, OAuth login, and post-MFA verification.
 */
export const createSession = async (user, deviceInfo = {}) => {
  // Enforce max concurrent sessions per user — evicts oldest if at cap
  const activeCount = await sessionRepository.countActiveByUserId(user.userId);
  if (activeCount >= SECURITY.SESSION.MAX_ACTIVE) {
    const sessions = await sessionRepository.findActiveByUserId(user.userId);
    const oldest = sessions[sessions.length - 1];
    if (oldest) {
      await sessionRepository.revokeSession(oldest.sessionId, "max_sessions_exceeded");
    }
  }

  const sessionId = generateUUID();
  const familyId = generateUUID();
  const jti = generateUUID();

  await sessionRepository.create({
    sessionId,
    userId: user.userId,
    familyId,
    tokenHash: hashForStorage(jti),
    passwordVersion: user.passwordVersion,
    device: deviceInfo,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });

  const refreshToken = jwt.sign(
    { sub: user.userId, sid: sessionId, fid: familyId, pwv: user.passwordVersion },
    env.JWT_REFRESH_SECRET,
    { ...jwtBaseOptions, expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS ?? 7}d`, jwtid: jti, audience: "kodeum-refresh" }
  );

  auditLog(AUDIT.SESSION_CREATED, { userId: user.userId, sessionId, ip: deviceInfo.ip });

  return {
    accessToken: signAccessToken(user, sessionId),
    refreshToken,
    sessionId,
  };
};

/**
 * Rotates the refresh token for an existing session.
 * On any anomaly (missing session, hash mismatch), the entire token family
 * is revoked to contain the blast radius of a stolen token.
 */
export const rotateSession = async (rawRefreshToken, deviceInfo = {}) => {
  let payload;
  try {
    payload = jwt.verify(rawRefreshToken, env.JWT_REFRESH_SECRET, {
      algorithms: ["HS256"],
      issuer: "kodeum",
      audience: "kodeum-refresh",
    });
  } catch {
    throw new AuthError("Invalid or expired refresh token");
  }

  const { sub: userId, sid: sessionId, fid: familyId, jti, pwv: passwordVersion } = payload;

  const session = await sessionRepository.findBySessionId(sessionId);

  if (!session) {
    // No session found — either already revoked or token was replayed after rotation.
    // Revoke the whole family as a precaution.
    if (familyId) {
      await sessionRepository.revokeByFamilyId(familyId, "missing_session_replay");
    }
    auditLog(AUDIT.TOKEN_REPLAY, { userId, sessionId, familyId, ip: deviceInfo.ip });
    throw new AuthError("Session not found or revoked");
  }

  // Timing-safe comparison of the stored token hash against the presented token
  if (!timingSafeCompare(session.tokenHash, hashForStorage(jti))) {
    await sessionRepository.revokeByFamilyId(familyId, "token_replay");
    auditLog(AUDIT.TOKEN_REPLAY, { userId, sessionId, familyId, ip: deviceInfo.ip });
    logger.warn({ event: AUDIT.TOKEN_REPLAY, userId, sessionId, familyId });
    throw new AuthError("Token replay detected — all sessions in this family have been revoked");
  }

  return { session, payload };
};

export const issueRotatedTokens = async (user, session, deviceInfo = {}) => {
  const newJti = generateUUID();
  // Slide the session document's TTL forward so long-running active sessions
  // never expire from MongoDB while their refresh token is still valid.
  // Without this, sessions expire 7 days from *login*, but the rotated JWT
  // carries a fresh 7-day window from *rotation time*, causing "session not found"
  // errors for users who use the app continuously across the original expiry.
  const newExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await sessionRepository.updateTokenHash(session.sessionId, hashForStorage(newJti), newExpiresAt);

  const refreshToken = jwt.sign(
    {
      sub: user.userId,
      sid: session.sessionId,
      fid: session.familyId,
      pwv: user.passwordVersion,
    },
    env.JWT_REFRESH_SECRET,
    { ...jwtBaseOptions, expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS ?? 7}d`, jwtid: newJti, audience: "kodeum-refresh" }
  );

  auditLog(AUDIT.TOKEN_REFRESHED, { userId: user.userId, sessionId: session.sessionId, ip: deviceInfo.ip });

  return {
    accessToken: signAccessToken(user, session.sessionId),
    refreshToken,
  };
};
