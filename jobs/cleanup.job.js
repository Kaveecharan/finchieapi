import cron from "node-cron";
import User from "../models/User.js";
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

  logger.info({ event: "cleanup_jobs_started" });
};
