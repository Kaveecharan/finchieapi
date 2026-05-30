import crypto from "crypto";
import { logger } from "../utils/logger.js";

export const requestId = (req, res, next) => {
  const id = crypto.randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
};

export const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info({
      event: "http_request",
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
      requestId: req.requestId,
      ip: req.ip,
    });
  });
  next();
};
