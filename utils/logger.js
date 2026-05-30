import { env } from "../config/env.js";

const LEVEL_WEIGHTS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = env.NODE_ENV === "production" ? "info" : "debug";

// Keys whose values should never appear in logs
const REDACTED = new Set([
  "password", "passwordhash", "token", "refreshtoken", "secret",
  "code", "hash", "pepper", "mfasecret", "backupcode",
]);

const redact = (value, depth = 0) => {
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) =>
      REDACTED.has(k.toLowerCase()) ? [k, "[REDACTED]"] : [k, redact(v, depth + 1)]
    )
  );
};

const write = (level, data, msg) => {
  if (LEVEL_WEIGHTS[level] < LEVEL_WEIGHTS[MIN_LEVEL]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    ...(msg ? { msg } : {}),
    ...(typeof data === "string" ? { msg: data } : redact(data)),
  };

  const line = JSON.stringify(entry) + "\n";
  level === "error" ? process.stderr.write(line) : process.stdout.write(line);
};

export const logger = {
  debug: (data, msg) => write("debug", data, msg),
  info: (data, msg) => write("info", data, msg),
  warn: (data, msg) => write("warn", data, msg),
  error: (data, msg) => write("error", data, msg),
};
