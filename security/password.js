import bcrypt from "bcrypt";
import { SECURITY } from "../config/security.js";
import { pepperPassword, timingSafeCompare } from "../utils/crypto.js";

const SPECIAL_CHAR_RE = /[!@#$%^&*()\-_=+[\]{};':"\\|,.<>/?`~]/;

export const validatePasswordPolicy = (password) => {
  const errs = [];
  if (password.length < SECURITY.PASSWORD.MIN_LENGTH)
    errs.push(`At least ${SECURITY.PASSWORD.MIN_LENGTH} characters required`);
  if (password.length > SECURITY.PASSWORD.MAX_LENGTH)
    errs.push("Password too long");
  if (!/[a-z]/.test(password)) errs.push("Must include a lowercase letter");
  if (!/[A-Z]/.test(password)) errs.push("Must include an uppercase letter");
  if (!/\d/.test(password)) errs.push("Must include a number");
  if (!SPECIAL_CHAR_RE.test(password)) errs.push("Must include a special character");
  return errs;
};

export const hashPassword = (password) =>
  bcrypt.hash(pepperPassword(password), SECURITY.BCRYPT_ROUNDS);

export const verifyPassword = (password, hash) =>
  bcrypt.compare(pepperPassword(password), hash);

// Check if password matches any in the user's recent history.
// Sequential — exits early on first match to avoid unnecessary bcrypt calls.
export const isPasswordReused = async (password, history = []) => {
  for (const oldHash of history) {
    if (await verifyPassword(password, oldHash)) return true;
  }
  return false;
};

// Dummy hash used to normalize response timing when a user doesn't exist.
// This prevents attackers from distinguishing "email not found" from "wrong password"
// via timing differences.
let _dummyHash = null;
export const getDummyHash = async () => {
  if (!_dummyHash) _dummyHash = await hashPassword("Dummy!TimingNormalization99");
  return _dummyHash;
};
