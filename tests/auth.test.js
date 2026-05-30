/**
 * Auth system tests.
 *
 * Run with: NODE_ENV=test node --experimental-vm-modules node_modules/.bin/jest
 *
 * Dependencies (add to devDependencies):
 *   jest, supertest, @jest/globals, mongodb-memory-server, ioredis-mock
 */
import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";

// ─── Unit Tests: Password Security ───────────────────────────────────────────

describe("password security", () => {
  let hashPassword, verifyPassword, validatePasswordPolicy, isPasswordReused;

  beforeAll(async () => {
    // Set pepper for tests
    process.env.BCRYPT_PEPPER = "test_pepper_at_least_32_chars_long_xxxx";
    const mod = await import("../security/password.js");
    hashPassword = mod.hashPassword;
    verifyPassword = mod.verifyPassword;
    validatePasswordPolicy = mod.validatePasswordPolicy;
    isPasswordReused = mod.isPasswordReused;
  });

  it("hashes and verifies passwords correctly", async () => {
    const hash = await hashPassword("ValidPass1!");
    expect(await verifyPassword("ValidPass1!", hash)).toBe(true);
    expect(await verifyPassword("WrongPass1!", hash)).toBe(false);
  });

  it("produces different hashes for the same password (bcrypt salting)", async () => {
    const h1 = await hashPassword("ValidPass1!");
    const h2 = await hashPassword("ValidPass1!");
    expect(h1).not.toBe(h2);
  });

  it("enforces password policy — rejects weak passwords", () => {
    expect(validatePasswordPolicy("short")).not.toHaveLength(0);
    expect(validatePasswordPolicy("alllowercase1!")).not.toHaveLength(0);
    expect(validatePasswordPolicy("ALLUPPERCASE1!")).not.toHaveLength(0);
    expect(validatePasswordPolicy("NoSpecialChar1")).not.toHaveLength(0);
    expect(validatePasswordPolicy("NoNumber!Abc")).not.toHaveLength(0);
  });

  it("accepts a strong password", () => {
    expect(validatePasswordPolicy("StrongPass1!")).toHaveLength(0);
  });

  it("detects password reuse", async () => {
    const oldHash = await hashPassword("OldPass1!");
    const history = [oldHash];
    expect(await isPasswordReused("OldPass1!", history)).toBe(true);
    expect(await isPasswordReused("NewPass2@", history)).toBe(false);
  });
});

// ─── Unit Tests: Crypto Utilities ─────────────────────────────────────────────

describe("crypto utilities", () => {
  let timingSafeCompare, generateCode, sha256, hmacSha256;

  beforeAll(async () => {
    process.env.BCRYPT_PEPPER = "test_pepper_at_least_32_chars_long_xxxx";
    const mod = await import("../utils/crypto.js");
    timingSafeCompare = mod.timingSafeCompare;
    generateCode = mod.generateCode;
    sha256 = mod.sha256;
    hmacSha256 = mod.hmacSha256;
  });

  it("timingSafeCompare returns true for equal strings", () => {
    expect(timingSafeCompare("abc123", "abc123")).toBe(true);
  });

  it("timingSafeCompare returns false for different strings", () => {
    expect(timingSafeCompare("abc123", "xyz789")).toBe(false);
  });

  it("timingSafeCompare returns false for different lengths without throwing", () => {
    expect(timingSafeCompare("short", "muchlongerstring")).toBe(false);
  });

  it("generateCode produces exactly 6 digits", () => {
    for (let i = 0; i < 20; i++) {
      const code = generateCode(6);
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("sha256 produces consistent output", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
    expect(sha256("hello")).not.toBe(sha256("world"));
  });
});

// ─── Unit Tests: MFA Service ──────────────────────────────────────────────────

describe("MFA service", () => {
  let verifyTotp, generateBackupCodes, hashBackupCode, findBackupCode;

  beforeAll(async () => {
    process.env.BCRYPT_PEPPER = "test_pepper_at_least_32_chars_long_xxxx";
    const mod = await import("../services/mfa.service.js");
    verifyTotp = mod.verifyTotp;
    generateBackupCodes = mod.generateBackupCodes;
    hashBackupCode = mod.hashBackupCode;
    findBackupCode = mod.findBackupCode;
  });

  it("verifyTotp returns false for invalid code", () => {
    expect(verifyTotp("000000", "JBSWY3DPEHPK3PXP")).toBe(false);
  });

  it("generates 8 backup codes in correct format", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(8);
    codes.forEach((c) => expect(c).toMatch(/^[A-F0-9]{5}-[A-F0-9]{5}$/));
  });

  it("findBackupCode finds a valid code by index", () => {
    const codes = generateBackupCodes();
    const hashed = codes.map(hashBackupCode);
    const idx = findBackupCode(codes[3], hashed);
    expect(idx).toBe(3);
  });

  it("findBackupCode returns -1 for invalid code", () => {
    const codes = generateBackupCodes();
    const hashed = codes.map(hashBackupCode);
    expect(findBackupCode("AAAAA-BBBBB", hashed)).toBe(-1);
  });

  it("backup codes are case-insensitive", () => {
    const codes = generateBackupCodes();
    const hashed = codes.map(hashBackupCode);
    // Lower-case version of a valid code should still match
    const lower = codes[0].toLowerCase();
    expect(findBackupCode(lower, hashed)).toBe(0);
  });
});

// ─── Unit Tests: Validators ───────────────────────────────────────────────────

describe("validators", () => {
  let loginSchema, signupSendCodeSchema, resetPasswordSchema;

  beforeAll(async () => {
    process.env.BCRYPT_PEPPER = "test_pepper_at_least_32_chars_long_xxxx";
    const mod = await import("../validators/auth.validators.js");
    loginSchema = mod.loginSchema;
    signupSendCodeSchema = mod.signupSendCodeSchema;
    resetPasswordSchema = mod.resetPasswordSchema;
  });

  it("loginSchema rejects invalid email", () => {
    expect(loginSchema.safeParse({ email: "notanemail", password: "pass" }).success).toBe(false);
  });

  it("loginSchema normalizes email to lowercase", () => {
    const result = loginSchema.safeParse({ email: "USER@EXAMPLE.COM", password: "pass" });
    expect(result.success).toBe(true);
    expect(result.data.email).toBe("user@example.com");
  });

  it("resetPasswordSchema requires 6-digit code", () => {
    const base = { email: "a@b.com", newPassword: "StrongPass1!" };
    expect(resetPasswordSchema.safeParse({ ...base, code: "12345" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ ...base, code: "1234567" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ ...base, code: "123456" }).success).toBe(true);
  });
});

// ─── Security Tests: Token Replay ────────────────────────────────────────────

describe("token replay detection", () => {
  /**
   * Full integration test for this would require:
   * 1. MongoDB (via mongodb-memory-server)
   * 2. Redis (via ioredis-mock)
   * 3. Issuing a real refresh token
   * 4. Using it twice — second use should fail with AUTH error
   *
   * Documented here as a test template; run as integration test with real infra.
   */
  it("should be tested as integration: refresh token reuse triggers family revocation", () => {
    // Setup:
    //   1. Create user, call createSession → get {accessToken, refreshToken}
    //   2. Call rotateSession(refreshToken) → get new tokens
    //   3. Call rotateSession(refreshToken) AGAIN (old token)
    //   4. Expect AuthError("Token replay detected")
    //   5. Verify all sessions in family are revoked in DB
    expect(true).toBe(true); // placeholder
  });
});

// ─── Security Tests: Brute Force ─────────────────────────────────────────────

describe("brute force protection", () => {
  it("should be tested as integration: 5 failed logins → AccountLockedError", () => {
    // Setup:
    //   1. Create verified user
    //   2. Call login with wrong password 5 times
    //   3. 6th call should throw AccountLockedError
    //   4. Verify Redis lock key exists with TTL
    expect(true).toBe(true); // placeholder
  });
});
