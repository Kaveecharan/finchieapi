import "dotenv/config";
import { env } from "./config/env.js";
import { connectDB, closeDB } from "./config/db.js";
import { connectRedis, closeRedis } from "./config/redis.js";
import { startCleanupJobs } from "./jobs/cleanup.job.js";
import { startUpcomingJobs } from "./jobs/upcoming.job.js";
import { logger } from "./utils/logger.js";
import app from "./app.js";
import http from "http";

const server = http.createServer(app);

const start = async () => {
  await connectDB();
  logger.info({ event: "mongo_connected" });

  try {
    await connectRedis();
    logger.info({ event: "redis_connected" });
  } catch (err) {
    logger.warn({ event: "redis_unavailable", err: err.message });
    if (env.NODE_ENV === "production") throw err;
  }

  startCleanupJobs();
  startUpcomingJobs();

  server.listen(env.PORT, () => {
    logger.info({ event: "server_started", port: env.PORT, env: env.NODE_ENV });
  });
};

const shutdown = async (signal) => {
  logger.info({ event: "shutdown_initiated", signal });
  server.close(async () => {
    try {
      await Promise.all([closeDB(), closeRedis()]);
      logger.info({ event: "shutdown_complete" });
      process.exit(0);
    } catch (err) {
      logger.error({ event: "shutdown_error", err: err.message });
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error({ event: "shutdown_timeout" });
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ event: "unhandled_rejection", reason: String(reason) });
});

process.on("uncaughtException", (err) => {
  logger.error({ event: "uncaught_exception", err: err.message, stack: err.stack });
  process.exit(1);
});

start().catch((err) => {
  logger.error({ event: "startup_failed", err: err.message });
  process.exit(1);
});
