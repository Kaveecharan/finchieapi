import { env } from "../config/env.js";
import { SECURITY } from "../config/security.js";

// ─── Domain guard ─────────────────────────────────────────────────────────────
// Setting domain="localhost" throws: `TypeError: option domain is invalid`.
// The `cookie` package enforces RFC-6265 which requires a registrable domain
// (at least one dot, or a public suffix). localhost has neither.
// Rule: only apply domain in production with a non-localhost value.
const resolveDomain = () => {
  if (env.NODE_ENV !== "production") return undefined;
  const d = env.COOKIE_DOMAIN?.trim();
  if (!d || d === "localhost" || d.startsWith("localhost:")) return undefined;
  return d;
};

// ─── Cookie options ───────────────────────────────────────────────────────────
// Development: secure=false (HTTP), sameSite=lax (relaxed for local tooling),
//              no domain (browser binds to current host automatically).
// Production:  secure=true (HTTPS only), sameSite=strict (no cross-site leakage),
//              domain scoped to configured value.
const buildOptions = () => {
  const isProd = env.NODE_ENV === "production";
  const domain = resolveDomain();

  return {
    httpOnly: true,          // JS cannot read the cookie — XSS mitigation
    secure: isProd,          // HTTPS-only in production
    sameSite: isProd ? "strict" : "lax",
    path: "/auth/refresh",   // cookie visible only to the refresh endpoint
    ...(domain ? { domain } : {}),
  };
};

export const setRefreshCookie = (res, token, ttlMs) => {
  res.cookie(SECURITY.COOKIE_NAME, token, {
    ...buildOptions(),
    maxAge: ttlMs ?? env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
};

export const clearRefreshCookie = (res) => {
  // Pass identical options so the browser actually deletes it (mismatched path/domain = not deleted)
  res.clearCookie(SECURITY.COOKIE_NAME, buildOptions());
};
