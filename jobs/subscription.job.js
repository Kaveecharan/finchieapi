import cron from "node-cron";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import { sendRenewalReminderEmail } from "../services/email.service.js";
import { logger } from "../utils/logger.js";

// Send reminder emails 7 days before trial end or subscription renewal.
// A ±1 day window (6–8 days) ensures the daily cron catches each subscription
// exactly once without requiring sub-day precision.
// renewalReminderSentAt deduplicates across retries — we never re-send if a
// reminder was sent within the last 20 days (well under the 30-day cycle).

const REMINDER_DAYS = 7;
const DEDUP_DAYS    = 20;

const runRenewalReminderJob = async () => {
  const now        = new Date();
  const rangeStart = new Date(now.getTime() + (REMINDER_DAYS - 1) * 86_400_000);
  const rangeEnd   = new Date(now.getTime() + (REMINDER_DAYS + 1) * 86_400_000);
  const staleAfter = new Date(now.getTime() - DEDUP_DAYS * 86_400_000);

  const subs = await Subscription.find({
    $and: [
      {
        $or: [
          { status: "trialing", trialEnd:         { $gte: rangeStart, $lte: rangeEnd } },
          { status: "active",   currentPeriodEnd: { $gte: rangeStart, $lte: rangeEnd } },
        ],
      },
      {
        $or: [
          { renewalReminderSentAt: null },
          { renewalReminderSentAt: { $lte: staleAfter } },
        ],
      },
    ],
    // Users who already cancelled don't need a "you'll be charged" reminder
    cancelAtPeriodEnd: { $ne: true },
  }).lean();

  if (!subs.length) {
    logger.info({ event: "renewal_reminder_job", sent: 0, failed: 0 });
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      const user = await User.findOne({ userId: sub.userId }, { email: 1, firstName: 1 }).lean();
      if (!user) continue;

      const isTrial     = sub.status === "trialing";
      const renewalDate = isTrial ? sub.trialEnd : sub.currentPeriodEnd;
      const daysLeft    = Math.ceil((new Date(renewalDate) - now) / 86_400_000);

      await sendRenewalReminderEmail(user.email, user.firstName, {
        daysLeft,
        renewalDate,
        isTrial,
        amount:   3.99,
        currency: "gbp",
      });

      await Subscription.updateOne(
        { userId: sub.userId },
        { $set: { renewalReminderSentAt: now } }
      );

      sent++;
    } catch (err) {
      failed++;
      logger.warn({ event: "renewal_reminder_failed", userId: sub.userId, err: err.message });
    }
  }

  logger.info({ event: "renewal_reminder_job", sent, failed });
};

export const startSubscriptionReminderJob = () => {
  cron.schedule("0 9 * * *", async () => {
    logger.info({ event: "renewal_reminder_job_start" });
    try {
      await runRenewalReminderJob();
    } catch (err) {
      logger.error({ event: "renewal_reminder_job_error", err: err.message });
    }
  });

  logger.info({ event: "renewal_reminder_job_registered", schedule: "0 9 * * *" });
};
