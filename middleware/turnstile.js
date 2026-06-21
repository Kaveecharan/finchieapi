import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const verifyTurnstile = async (req, res, next) => {
  if (!env.TURNSTILE_SECRET_KEY) return next();

  const token = req.body?.cfToken;
  if (!token) return next(new AppError("CAPTCHA token missing", 400, "CAPTCHA_REQUIRED"));
  console.log("[Turnstile] verifying token:", token.substring(0, 30), "len:", token.length);

  try {
    const resp = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY.trim(),
        response: token,
      }),
    });
    const data = await resp.json();
    if (!data.success) {
      console.error("[Turnstile] siteverify response:", JSON.stringify(data));
      return next(new AppError("CAPTCHA verification failed", 400, "CAPTCHA_FAILED"));
    }
    next();
  } catch {
    next(new AppError("CAPTCHA service unavailable", 503, "CAPTCHA_UNAVAILABLE"));
  }
};
