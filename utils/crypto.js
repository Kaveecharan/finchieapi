import crypto from "crypto";
import { env } from "../config/env.js";

export const generateUUID = () => crypto.randomUUID();

export const generateSecureToken = (bytes = 32) =>
  crypto.randomBytes(bytes).toString("hex");

// Cryptographically uniform random digit code — rejection sampling eliminates modulo bias.
// Without rejection, codes 000000–967295 would be ~0.022% more likely (uint32 % 1e6 isn't uniform).
export const generateCode = (digits = 6) => {
  const max = 10 ** digits;
  // Largest multiple of max that fits in uint32 — values >= limit are discarded
  const limit = Math.floor(0x100000000 / max) * max;
  let num;
  do {
    num = crypto.randomBytes(4).readUInt32BE(0);
  } while (num >= limit);
  return (num % max).toString().padStart(digits, "0");
};

// HMAC-SHA256 for verification code hashing — keyed hash prevents rainbow tables
export const hmacSha256 = (input, key) =>
  crypto.createHmac("sha256", key).update(String(input)).digest("hex");

// Unkeyed SHA256 for non-secret storage (e.g., JWT jti in session records)
export const sha256 = (input) =>
  crypto.createHash("sha256").update(String(input)).digest("hex");

// Constant-time string comparison — prevents timing attacks on hash comparisons.
// Handles length differences by padding; always runs full comparison before returning.
export const timingSafeCompare = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Still run a comparison to normalize timing
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
};

// Pepper application: HMAC with app-level secret before bcrypt.
// Protects passwords even if the DB is fully compromised — attacker still needs the pepper.
export const pepperPassword = (plaintext) =>
  hmacSha256(plaintext, env.BCRYPT_PEPPER);

export const hashForStorage = (value) => sha256(value);
