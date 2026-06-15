import helmet from "helmet";
import cors from "cors";
import { sanitize as mongoSanitizeFn, has as mongoHas } from "express-mongo-sanitize";
import hpp from "hpp";
import { env } from "../config/env.js";

// Helmet with explicit CSP instead of default — default CSP is too permissive
// for production and often causes false confidence.
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'none'"],
      styleSrc: ["'none'"],
      imgSrc: ["'none'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "deny" },
  hsts: {
    maxAge: 63072000, // 2 years
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  referrerPolicy: { policy: "no-referrer" },
  xssFilter: true,
});

// Origins always allowed for the admin dashboard regardless of CORS_ORIGIN env var
const ADMIN_ORIGINS = [
  "https://admin.getfinchie.com",
  "http://localhost:5173",
];

const allowedOrigins = [
  ...env.CORS_ORIGIN.split(",").map((o) => o.trim()),
  ...ADMIN_ORIGINS,
];

export const corsMiddleware = cors({
  origin: (origin, cb) => {
    // Allow requests with no origin header (native mobile, curl, same-origin).
    // Also allow the literal string "null" sent by sandboxed WebViews / file:// origins.
    if (!origin || origin === "null" || allowedOrigins.includes(origin)) return cb(null, true);
    // Reject without passing an Error — passing Error causes Express to emit 500.
    // Omitting the CORS headers is enough: browsers block, curl proceeds (API-only risk).
    cb(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id", "X-Device-Id", "X-Client-Type", "X-Platform"],
  exposedHeaders: ["X-Request-Id"],
  maxAge: 600, // preflight cache 10 minutes
});

// Strips MongoDB operator keys ($where, $gt, etc.) from user input.
// Prevents NoSQL injection when input flows directly into query filters.
//
// Custom middleware because express-mongo-sanitize v2.2.0 does `req.query = sanitized`
// which throws in Express 5 / router v2 where req.query is a getter-only property.
// We reassign body/params (plain objects) and mutate query in-place instead.
const sanitizeOpts = { replaceWith: "_" };

function mutateSanitize(obj) {
  if (!obj || typeof obj !== "object") return;
  const clean = mongoSanitizeFn(obj, sanitizeOpts);
  for (const key of Object.keys(obj)) {
    if (!(key in clean)) delete obj[key];
    else obj[key] = clean[key];
  }
}

export const mongoSanitizeMiddleware = (req, res, next) => {
  let sanitized = false;

  if (req.body && mongoHas(req.body)) {
    req.body = mongoSanitizeFn(req.body, sanitizeOpts);
    sanitized = true;
  }
  if (req.params && mongoHas(req.params)) {
    req.params = mongoSanitizeFn(req.params, sanitizeOpts);
    sanitized = true;
  }
  // req.query is getter-only in router v2 — mutate in-place.
  if (req.query && mongoHas(req.query)) {
    mutateSanitize(req.query);
    sanitized = true;
  }

  if (sanitized) {
    process.stderr.write(
      JSON.stringify({
        event: "mongo_injection_attempt",
        ip: req.ip,
        path: req.path,
        ts: new Date().toISOString(),
      }) + "\n"
    );
  }

  next();
};

// HTTP Parameter Pollution: prevents duplicate parameter attacks (e.g., role=user&role=admin)
// that some middleware processes as an array and picks the last value.
export const hppMiddleware = hpp();
