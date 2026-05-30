import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),

  MONGODB_URI: z.string().min(1, "MONGODB_URI required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Minimum 32 chars enforced — short secrets are brute-forceable
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be >= 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be >= 32 chars"),

  // Pepper adds a second factor of password security: even with a full DB dump,
  // attackers cannot crack passwords without also stealing the pepper from config
  BCRYPT_PEPPER: z.string().min(32, "BCRYPT_PEPPER must be >= 32 chars"),

  ACCESS_TOKEN_TTL: z.string().default("30m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),

  CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN required"),
  COOKIE_DOMAIN: z.string().optional(),
  TRUSTED_PROXIES: z.coerce.number().default(1),

  GOOGLE_WEB_CLIENT_ID:     z.string().optional(),
  GOOGLE_IOS_CLIENT_ID:     z.string().optional(),
  GOOGLE_ANDROID_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET:     z.string().optional(),

  EMAIL_USER: z.string().email("EMAIL_USER must be a valid email"),
  EMAIL_PASS: z.string().min(1, "EMAIL_PASS required"),
  EMAIL_FROM_NAME: z.string().default("Kodeum"),
  SUPPORT_EMAIL: z.string().email().optional(), // falls back to EMAIL_USER if not set

  MFA_ISSUER: z.string().default("Kodeum"),
  APP_NAME: z.string().default("Kodeum"),

  OPENAI_API_KEY: z.string().optional(),

  TURNSTILE_SECRET_KEY: z.string().optional(),

  // ── Stripe (optional — subscription features disabled when absent) ────────────
  STRIPE_SECRET_KEY:      z.string().optional(),
  STRIPE_WEBHOOK_SECRET:  z.string().optional(),
  // The recurring price ID for the £3.99/month premium plan (create in Stripe dashboard)
  STRIPE_PRICE_ID:        z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // ── Cloudinary ───────────────────────────────────────────────────────────────
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY:    z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // ── Currency ─────────────────────────────────────────────────────────────────
  CURRENCY_SYMBOL: z.string().default("Rs"),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  process.stderr.write(`[FATAL] Environment validation failed:\n${issues}\n`);
  process.exit(1);
}

export const env = result.data;
