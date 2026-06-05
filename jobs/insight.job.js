import cron from "node-cron";
import User from "../models/User.js";
import Subscription, { isPremiumActive } from "../models/Subscription.js";
import { insightService } from "../services/insight.service.js";
import { sendPushNotification } from "../services/pushNotification.service.js";
import { logger } from "../utils/logger.js";

// ── Day-level in-memory cache ─────────────────────────────────────────────────
// Avoids re-running MongoDB aggregations twice within the same calendar day
// (morning + evening jobs share the same computed insight list).
// Key: userId  Value: { date: "YYYY-MM-DD", insights: Insight[] }
const _dayCache = new Map();

const todayISO = () => new Date().toISOString().slice(0, 10);

const getInsights = async (userId) => {
  const today = todayISO();
  const hit = _dayCache.get(userId);
  if (hit?.date === today) return hit.insights;

  const insights = await insightService.computeForUser(userId);
  _dayCache.set(userId, { date: today, insights });
  return insights;
};

// Called once per morning run to evict yesterday's entries.
const pruneCache = () => {
  const today = todayISO();
  for (const [uid, val] of _dayCache) {
    if (val.date !== today) _dayCache.delete(uid);
  }
};

// ── Premium user lookup ───────────────────────────────────────────────────────
// Queries subscriptions first (small collection), then fetches only those users
// that are definitively premium right now and have at least one push token.
const getPremiumUsers = async () => {
  const subs = await Subscription.find({
    status: { $in: ["trialing", "active", "cancelled", "past_due"] },
  }).lean();

  const premiumIds = subs.filter(isPremiumActive).map((s) => s.userId);
  if (!premiumIds.length) return [];

  return User.find({
    userId: { $in: premiumIds },
    pushTokens: { $exists: true, $not: { $size: 0 } },
  })
    .select("userId pushTokens")
    .lean();
};

// ── Core dispatch ─────────────────────────────────────────────────────────────
// For every premium user, fetches (or reads from cache) their ranked insights
// and sends the one at [insightIndex]. Users with no insight at that index are
// silently skipped — no notification is better than an empty or stale one.
const dispatch = async (insightIndex, logEvent) => {
  try {
    const users = await getPremiumUsers();
    if (!users.length) {
      logger.info({ event: logEvent, sent: 0, skipped: 0, total: 0 });
      return;
    }

    let sent = 0;
    let skipped = 0;

    for (const user of users) {
      try {
        const insights = await getInsights(user.userId);
        const insight = insights[insightIndex];

        if (!insight) {
          skipped++;
          continue;
        }

        for (const token of user.pushTokens) {
          await sendPushNotification(token, insight.title, insight.body);
        }
        sent++;
      } catch (err) {
        logger.warn({
          event: `${logEvent}_user_failed`,
          userId: user.userId,
          err: err.message,
        });
      }
    }

    logger.info({ event: logEvent, sent, skipped, total: users.length });
  } catch (err) {
    logger.error({ event: `${logEvent}_failed`, err: err.message });
  }
};

// ── Scheduled handlers ────────────────────────────────────────────────────────

// 11:30 AM UTC — "Daily financial awareness (midday check-in)"
// Sends insight[0]: highest-priority insight for the day.
// Also prunes yesterday's cache entries before computing.
const runMiddayInsights = async () => {
  pruneCache();
  await dispatch(0, "insight_midday");
};

// 7:45 PM UTC — "Daily financial summary (end-of-day review)"
// Sends insight[1]: second-priority insight (different from midday).
// Reads from cache populated by the morning run when available.
const runEveningInsights = () => dispatch(1, "insight_evening");

// ── Job registration ──────────────────────────────────────────────────────────
export const startInsightJobs = () => {
  cron.schedule("30 11 * * *", runMiddayInsights);  // 11:30 AM UTC
  cron.schedule("45 19 * * *", runEveningInsights); // 7:45 PM UTC
  logger.info({ event: "insight_jobs_started" });
};
