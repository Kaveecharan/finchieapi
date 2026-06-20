import { createRequire } from "module";
const { authenticator } = createRequire(import.meta.url)("otplib");
import QRCode from "qrcode";
import crypto from "crypto";
import { env } from "../config/env.js";
import { SECURITY } from "../config/security.js";
import { sha256, hmacSha256, timingSafeCompare } from "../utils/crypto.js";
import { env } from "../config/env.js";

authenticator.options = {
  window: SECURITY.TOTP.WINDOW,
  digits: 6,
  period: 30,
  algorithm: "sha1", // RFC 6238 standard
};

export const generateMfaSetup = async (user) => {
  const secret = authenticator.generateSecret(20);
  const otpauth = authenticator.keyuri(user.email, env.MFA_ISSUER, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);
  return { secret, qrCodeDataUrl };
};

export const verifyTotp = (code, secret) => {
  try {
    return authenticator.verify({ token: String(code), secret });
  } catch {
    return false;
  }
};

// Generates backup codes as `XXXXX-XXXXX` hex strings.
// 10 random hex chars = 40 bits of entropy — brute-force resistant.
export const generateBackupCodes = () =>
  Array.from({ length: SECURITY.TOTP.BACKUP_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });

// Normalize before hashing — case/dash insensitive on input.
// HMAC-keyed with BCRYPT_PEPPER to prevent rainbow tables on the 40-bit code space.
export const hashBackupCode = (code) =>
  hmacSha256(code.replace(/-/g, "").toUpperCase(), env.BCRYPT_PEPPER);

/**
 * Checks if the presented backup code matches any stored hash.
 * Returns the index of the matched code (to remove it) or -1.
 * Uses constant-time comparison on the matched hash to prevent timing leaks.
 */
export const findBackupCode = (code, hashedCodes = []) => {
  const inputHash = hashBackupCode(code);
  for (let i = 0; i < hashedCodes.length; i++) {
    if (timingSafeCompare(inputHash, hashedCodes[i])) return i;
  }
  return -1;
};
