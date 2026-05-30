import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { SECURITY } from "../config/security.js";
import { RateLimitError } from "../errors/AppError.js";

const handler = (req, res, next, options) => {
  next(
    new RateLimitError(
      "Too many requests. Please wait before trying again.",
      Math.ceil(options.windowMs / 1000)
    )
  );
};

const makeLimit = ({ windowMs, max }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler,
    // keyGenerator: for multi-instance deployments, swap this store for
    // RedisStore (rate-limit-redis package) to share counters across instances
    keyGenerator: (req) => ipKeyGenerator(req.ip),
  });

// Scoped limiters — more restrictive on sensitive/auth endpoints
export const globalLimiter = makeLimit(SECURITY.RATE_LIMITS.GLOBAL);

export const authLimiter = makeLimit(SECURITY.RATE_LIMITS.AUTH);

// Per-user limit (after authentication)
export const authUserLimiter = rateLimit({
  windowMs: SECURITY.RATE_LIMITS.AUTH.windowMs,
  max: SECURITY.RATE_LIMITS.AUTH.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  keyGenerator: (req) => req.user?.userId ?? ipKeyGenerator(req.ip),
});

export const sensitiveLimiter = makeLimit(SECURITY.RATE_LIMITS.SENSITIVE);
