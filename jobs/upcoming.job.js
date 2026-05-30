import cron from "node-cron";
import User from "../models/User.js";
import { upcomingRepository } from "../repositories/upcoming.repository.js";
import { sendPushNotification } from "../services/pushNotification.service.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";

const CURRENCY_SYMBOL = env.CURRENCY_SYMBOL;

// Get UTC day boundaries for today
const todayBounds = () => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const fmtAmount = (n) =>
  `${CURRENCY_SYMBOL ?? ""}${Math.round(n ?? 0).toLocaleString("en-US")}`;

// Fetch push tokens for a list of userIds (deduped)
const getTokenMap = async (userIds) => {
  const unique = [...new Set(userIds)];
  const users = await User.find({ userId: { $in: unique } }).select("userId pushTokens").lean();
  const map = {};
  for (const u of users) map[u.userId] = u.pushTokens ?? [];
  return map;
};

const sendToUser = async (tokens, title, body) => {
  for (const token of tokens) {
    await sendPushNotification(token, title, body);
  }
};

// ── 7 AM: info notification ──────────────────────────────────────────────────
// "You have an upcoming expense/income of X today"
const runMorningNotifications = async () => {
  try {
    const { start, end } = todayBounds();
    const items = await upcomingRepository.findPendingDueOnMissingMorning(start, end);
    if (!items.length) return;

    const tokenMap = await getTokenMap(items.map((i) => i.userId));

    for (const item of items) {
      const tokens = tokenMap[item.userId] ?? [];
      if (!tokens.length) continue;

      const typeLabel = item.transactionType === "expense" ? "expense" : "income";
      const desc = item.transactionType === "expense" ? item.itemName : (item.incomeType || "Income");
      const title = item.transactionType === "expense"
        ? `Upcoming expense today: ${fmtAmount(item.amount)}`
        : `Upcoming income today: ${fmtAmount(item.amount)}`;
      const body = `${desc} · ${item.category?.name ?? typeLabel} · Due today. Tap to review.`;

      await sendToUser(tokens, title, body);
      await upcomingRepository.markMorningNotifSent(item._id);
    }

    logger.info({ event: "upcoming_morning_notifs_sent", count: items.length });
  } catch (err) {
    logger.error({ event: "upcoming_morning_notifs_failed", err: err.message });
  }
};

// ── 7 PM: action reminder ────────────────────────────────────────────────────
// "Reminder: take action on your upcoming X"
const runEveningNotifications = async () => {
  try {
    const { start, end } = todayBounds();
    const items = await upcomingRepository.findPendingDueOnMissingEvening(start, end);
    if (!items.length) return;

    const tokenMap = await getTokenMap(items.map((i) => i.userId));

    for (const item of items) {
      const tokens = tokenMap[item.userId] ?? [];
      if (!tokens.length) continue;

      const desc = item.transactionType === "expense" ? item.itemName : (item.incomeType || "Income");
      const title = "Action required — upcoming transaction";
      const body  = `${desc} of ${fmtAmount(item.amount)} is due today. Approve or decline it now.`;

      await sendToUser(tokens, title, body);
      await upcomingRepository.markEveningNotifSent(item._id);
    }

    logger.info({ event: "upcoming_evening_notifs_sent", count: items.length });
  } catch (err) {
    logger.error({ event: "upcoming_evening_notifs_failed", err: err.message });
  }
};

// ── Midnight: clean up declined items older than 3 days ─────────────────────
const runDeclinedCleanup = async () => {
  try {
    const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const result = await upcomingRepository.deleteDeclinedBefore(cutoff);
    logger.info({ event: "upcoming_declined_cleanup", deleted: result.deletedCount });
  } catch (err) {
    logger.error({ event: "upcoming_declined_cleanup_failed", err: err.message });
  }
};

export const startUpcomingJobs = () => {
  cron.schedule("0 7 * * *",  runMorningNotifications);  // 7:00 AM
  cron.schedule("0 19 * * *", runEveningNotifications);  // 7:00 PM
  cron.schedule("0 0 * * *",  runDeclinedCleanup);       // Midnight

  logger.info({ event: "upcoming_jobs_started" });
};
