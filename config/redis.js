import Redis from "ioredis";
import { env } from "./env.js";

let client = null;

export const getRedis = () => client;

export const connectRedis = async () => {
  const instance = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  instance.on("error", (err) => {
    process.stderr.write(
      JSON.stringify({ event: "redis_error", msg: err.message, ts: new Date().toISOString() }) + "\n"
    );
  });

  await instance.connect();
  client = instance;
  return client;
};

export const closeRedis = async () => {
  if (client) {
    await client.quit();
    client = null;
  }
};
