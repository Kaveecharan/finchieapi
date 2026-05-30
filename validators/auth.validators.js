import { z } from "zod";

// Reusable primitives
const email = z
  .string()
  .email("Invalid email")
  .max(254)
  .transform((v) => v.toLowerCase().trim());

const password = z.string().min(1, "Password required").max(128);

const code = z
  .string()
  .length(6, "Code must be 6 digits")
  .regex(/^\d{6}$/, "Code must be numeric");

// Accepts optional client-provided device fingerprint for session tracking
const deviceId = z.string().max(128).optional();

export const signupSendCodeSchema = z.object({
  email,
  password,
  firstName: z.string().min(1).max(50).trim(),
  deviceId,
});

export const verifySignupCodeSchema = z.object({
  email,
  code,
  deviceId,
});

export const resendCodeSchema = z.object({ email });

export const loginSchema = z.object({
  email,
  password,
  deviceId,
});

export const mfaVerifySchema = z.object({
  mfaToken: z.string().uuid("Invalid MFA token"),
  // Exactly one of code or backupCode required
  code: z.string().optional(),
  backupCode: z.string().optional(),
  deviceId,
}).refine(
  (d) => d.code || d.backupCode,
  { message: "Provide either a TOTP code or a backup code" }
);

export const refreshSchema = z.object({
  // Refresh token comes from the HttpOnly cookie (rt) — no body validation needed.
  // We validate deviceId from body/header for session context.
  deviceId,
});

export const googleLoginSchema = z.object({
  id_token: z.string().min(1, "id_token required"),
  platform: z.enum(["android", "ios", "web"]),
  deviceId,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  email,
  code,
  newPassword: z.string().min(1, "New password required").max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1).max(128),
});

export const mfaConfirmSchema = z.object({
  // Secret is no longer accepted from the client — it is stored server-side
  // in Redis during setupMfa and retrieved here by userId.
  code: z.string().length(6).regex(/^\d{6}$/),
});

export const disableMfaSchema = z.object({
  password: z.string().min(1),
});
