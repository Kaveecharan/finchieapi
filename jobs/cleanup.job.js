import cron from "node-cron";
import User from "../models/User.js";
import Expense from "../models/Expense.js";
import Income from "../models/Income.js";
import { userRepository } from "../repositories/user.repository.js";
import { logger } from "../utils/logger.js";

// Removes unverified users older than 24 hours.
// Users who never verify their email are soft-garbage — they hold email slots
// and clutter the collection. Clean daily at 3am.
export const startCleanupJobs = () => {
  cron.schedule("0 3 * * *", async () => {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await userRepository.deleteUnverifiedExpired(cutoff);
      logger.info({ event: "cleanup_unverified_users", deleted: result.deletedCount });
    } catch (err) {
      logger.error({ event: "cleanup_job_failed", err: err.message });
    }
  });

  // Delete deactivated accounts whose 30-day grace period has expired
  cron.schedule("30 3 * * *", async () => {
    try {
      const result = await User.deleteMany({
        status: "deactivated",
        deletedAt: { $lte: new Date() },
      });
      logger.info({ event: "cleanup_deactivated_accounts", deleted: result.deletedCount });
    } catch (err) {
      logger.error({ event: "cleanup_deactivated_failed", err: err.message });
    }
  });

  // Delete pending transactions whose scheduled date has already passed.
  // Runs at 1 AM UTC — any pending item with a date < start-of-today was never approved
  // and is now stale. Users had until the end of their scheduled day to act.
  cron.schedule("0 1 * * *", async () => {
    try {
      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);

      const [expResult, incResult] = await Promise.all([
        Expense.deleteMany({ status: "pending", date: { $lt: startOfToday } }),
        Income.deleteMany({ status: "pending", date: { $lt: startOfToday } }),
      ]);

      logger.info({
        event: "cleanup_expired_pending",
        expenses: expResult.deletedCount,
        incomes: incResult.deletedCount,
      });
    } catch (err) {
      logger.error({ event: "cleanup_expired_pending_failed", err: err.message });
    }
  });

  logger.info({ event: "cleanup_jobs_started" });
};
