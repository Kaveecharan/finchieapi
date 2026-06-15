import express from "express";
import cookieParser from "cookie-parser";
import { helmetMiddleware, corsMiddleware, mongoSanitizeMiddleware, hppMiddleware } from "./middleware/security.js";
import { globalLimiter } from "./middleware/rateLimiter.js";
import { requestId, requestLogger } from "./middleware/requestId.js";
import { AppError } from "./errors/AppError.js";
import { logger } from "./utils/logger.js";
import authRoutes from "./routes/auth.routes.js";
import expenseRoutes from "./routes/expense.routes.js";
import incomeRoutes from "./routes/income.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import budgetRoutes      from "./routes/budget.routes.js";
import cloudinaryRoutes  from "./routes/cloudinary.routes.js";
import upcomingRoutes    from "./routes/upcoming.routes.js";
import profileRoutes     from "./routes/profile.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import supportRoutes       from "./routes/support.routes.js";
import savingsRoutes            from "./routes/savings.routes.js";
import chatRoutes               from "./routes/chat.routes.js";
import subscriptionRoutes       from "./routes/subscription.routes.js";
import financeScoreRoutes       from "./routes/financeScore.routes.js";
import adminRoutes               from "./routes/admin.routes.js";
import { env } from "./config/env.js";

const app = express();

app.set("trust proxy", env.TRUSTED_PROXIES);

app.use(helmetMiddleware);
app.use(corsMiddleware);

// ── Stripe webhook — must receive raw (unparsed) body ─────────────────────────
// Registered BEFORE express.json() because Stripe signature verification
// requires the exact raw bytes; json() would re-serialise and break it.
app.use("/subscriptions/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

app.use(mongoSanitizeMiddleware);
app.use(hppMiddleware);

app.use(requestId);
app.use(requestLogger);

app.use(globalLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/auth", authRoutes);
app.use("/expenses", expenseRoutes);
app.use("/incomes", incomeRoutes);
app.use("/categories", categoryRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/budgets",    budgetRoutes);
app.use("/cloudinary",     cloudinaryRoutes);
app.use("/upcoming",       upcomingRoutes);
app.use("/profile",        profileRoutes);
app.use("/notifications",  notificationsRoutes);
app.use("/support",        supportRoutes);
app.use("/savings",        savingsRoutes);
app.use("/chat",           chatRoutes);
app.use("/subscriptions",  subscriptionRoutes);
app.use("/finance-score",  financeScoreRoutes);
app.use("/admin",          adminRoutes);

app.get("/test", (req, res) => {
  res.json({ success: true, message: "API working properly" });
});

// ─── 404 — catch all unmatched routes and return JSON (never HTML) ────────────
app.use((req, res) => {
  res.status(404).json({ error: "Not Found", code: "NOT_FOUND", requestId: req.requestId });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.isOperational) {
    // Emit the standard Retry-After header for 429s so clients and mobile SDKs
    // can back off without parsing the JSON body (RFC 6585 §4).
    if (err.retryAfter) res.setHeader("Retry-After", String(err.retryAfter));
    const body = {
      success: false,
      message: err.message,
      error: err.message,
      code: err.code,
      ...(err.errors?.length ? { errors: err.errors } : {}),
      ...(err.retryAfter ? { retryAfter: err.retryAfter } : {}),
      ...(err.mfaToken ? { mfaToken: err.mfaToken } : {}),
      requestId: req.requestId,
    };
    return res.status(err.statusCode).json(body);
  }

  logger.error({
    event: "unhandled_error",
    err: err.message,
    stack: err.stack,
    requestId: req.requestId,
    path: req.path,
  });

  res.status(500).json({
    success: false,
    message: "An unexpected error occurred",
    error: "An unexpected error occurred",
    code: "INTERNAL_ERROR",
    requestId: req.requestId,
  });
});

export default app;
