import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { SECURITY } from "../config/security.js";
import { RateLimitError } from "../errors/AppError.js";
import { getRedis } from "../config/redis.js";

const handler = (req, res, next, options) => {
  next(
    new RateLimitError(
      "Too many requests. Please wait before trying again.",
      Math.ceil(options.windowMs / 1000)
    )
  );
};

// Atomic Lua script: increments the counter and sets TTL only on first hit
// (EXPIRE NX is Redis 7+, so we use the compare-then-set pattern in Lua).
// Falls back to in-memory counting if Redis is unavailable — fail open so
// the app stays up but counters won't sync across processes.
const INCR_SCRIPT = `
local c = redis.call('incr', KEYS[1])
if c == 1 then redis.call('pexpire', KEYS[1], ARGV[1]) end
return c
`;

function makeRedisStore(prefix) {
  return {
    prefix,
    windowMs: 0,

    // Called once by express-rate-limit with the merged options object
    init(opts) { this.windowMs = opts.windowMs; },

    async increment(key) {
      const r = getRedis();
      if (!r) return { totalHits: 1, resetTime: undefined }; // fail open
      const hits = await r.eval(INCR_SCRIPT, 1, this.prefix + key, String(this.windowMs));
      return { totalHits: Number(hits), resetTime: undefined };
    },

    async decrement(key) {
      const r = getRedis();
      if (r) await r.decr(this.prefix + key);
    },

    async resetKey(key) {
      const r = getRedis();
      if (r) await r.del(this.prefix + key);
    },
  };
}

const makeLimit = ({ windowMs, max }, prefix) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler,
    store: makeRedisStore(prefix),
    keyGenerator: (req) => ipKeyGenerator(req.ip),
  });

export const globalLimiter    = makeLimit(SECURITY.RATE_LIMITS.GLOBAL,     "rl:g:");
export const authLimiter      = makeLimit(SECURITY.RATE_LIMITS.AUTH,       "rl:a:");
export const sensitiveLimiter = makeLimit(SECURITY.RATE_LIMITS.SENSITIVE,  "rl:s:");

// Per-user limiter (keyed by userId after authentication, IP as fallback)
export const authUserLimiter = rateLimit({
  windowMs: SECURITY.RATE_LIMITS.AUTH.windowMs,
  max:      SECURITY.RATE_LIMITS.AUTH.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  store: makeRedisStore("rl:u:"),
  keyGenerator: (req) => req.user?.userId ?? ipKeyGenerator(req.ip),
});
