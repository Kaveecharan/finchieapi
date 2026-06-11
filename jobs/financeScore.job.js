import cron from "node-cron";
import User from "../models/User.js";
import Subscription, { isPremiumActive } from "../models/Subscription.js";
import { financeScoreRepository } from "../repositories/financeScore.repository.js";
import { financeScoreService } from "../services/financeScore.service.js";
import { sendPushNotification } from "../services/pushNotification.service.js";
import { logger } from "../utils/logger.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns {userId, pushTokens}[] for premium-subscribed users only.
const getPremiumUsers = async () => {
  const subs = await Subscription.find({
    status: { $in: ["trialing", "active", "cancelled", "past_due"] },
  }).lean();

  const premiumIds = subs.filter(isPremiumActive).map((s) => s.userId);
  if (!premiumIds.length) return [];

  return User.find({
    userId:    { $in: premiumIds },
    isDeleted: { $ne: true },
  })
    .select("userId pushTokens")
    .lean();
};

// ── Core batch ────────────────────────────────────────────────────────────────

const runFinanceScoreJob = async () => {
  const jobStart = Date.now();
  let processed = 0, skipped = 0, failed = 0, notified = 0;

  try {
    // Step 1: collect premium users and those due for recalculation
    const [dueUsers, allUsers] = await Promise.all([
      financeScoreRepository.findDueUsers(),
      getPremiumUsers(),
    ]);

    // Step 2: collect user IDs that have never been scored
    const scoredIds = new Set(dueUsers.map((u) => u.userId));
    const neverScoredIds = new Set();

    // Build a map of userId → pushTokens for notification later
    const userMap = {};
    for (const u of allUsers) {
      userMap[u.userId] = u.pushTokens ?? [];
      if (!scoredIds.has(u.userId)) {
        neverScoredIds.add(u.userId);
      }
    }

    // Only score users without a score yet or those due — check never-scored against DB
    const existingScoredIds = new Set(await financeScoreRepository.findScoredUserIds());
    const trulyNeverScored = [...neverScoredIds].filter((id) => !existingScoredIds.has(id));

    // Combine due + never-scored
    const targetUserIds = [
      ...new Set([...dueUsers.map((u) => u.userId), ...trulyNeverScored]),
    ];

    if (!targetUserIds.length) {
      logger.info({ event: "finance_score_job_done", processed: 0, skipped: 0, failed: 0, ms: Date.now() - jobStart });
      return;
    }

    // Step 3: process each user sequentially to avoid overwhelming OpenAI
    for (const userId of targetUserIds) {
      try {
        const result = await financeScoreService.calculateForUser(userId, { force: false });

        if (result.skipped) {
          skipped++;
          continue;
        }

        processed++;

        // Notify if score changed noticeably (±5 points minimum) and user has push tokens
        const tokens = userMap[userId] ?? [];
        if (
          tokens.length > 0 &&
          result.scoreChange !== null &&
          Math.abs(result.scoreChange) >= 5
        ) {
          const direction = result.scoreChange > 0 ? "improved" : "dropped";
          const change    = Math.abs(result.scoreChange);
          const title     = `Finance Score ${direction === "improved" ? "↑" : "↓"} ${result.score}/500`;
          const body      = result.scoreChange > 0
            ? `Your score ${direction} by ${change} points — ${result.saved?.rating ?? ""} rating.`
            : `Your score ${direction} by ${change} points. Check your recommendations.`;

          for (const token of tokens) {
            try {
              await sendPushNotification(token, title, body, {
                screen: "FinanceScore",
                score:  String(result.score),
              });
              notified++;
            } catch (notifErr) {
              logger.warn({ event: "finance_score_notify_failed", userId, err: notifErr.message });
            }
          }
        }
      } catch (err) {
        failed++;
        logger.warn({ event: "finance_score_user_failed", userId, err: err.message });
      }
    }

    logger.info({
      event: "finance_score_job_done",
      processed, skipped, failed, notified,
      total: targetUserIds.length,
      ms: Date.now() - jobStart,
    });
  } catch (err) {
    logger.error({ event: "finance_score_job_failed", err: err.message });
  }
};

// ── Job registration ──────────────────────────────────────────────────────────
// Runs at 3:00 AM UTC daily — off-peak, low-cost window.
export const startFinanceScoreJob = () => {
  cron.schedule("0 3 * * *", runFinanceScoreJob);
  logger.info({ event: "finance_score_job_started" });
};
