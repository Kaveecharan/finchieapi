import express from "express";
import crypto from "crypto";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";

const router = express.Router();

const CLOUD_NAME = env.CLOUDINARY_CLOUD_NAME;
const API_KEY    = env.CLOUDINARY_API_KEY;
const API_SECRET = env.CLOUDINARY_API_SECRET;

// POST /cloudinary/sign
// Returns a short-lived signed timestamp so the client can upload
// directly to Cloudinary without exposing the API secret in the app bundle.
router.post(
  "/sign",
  authenticate,
  asyncHandler(async (_req, res) => {
    const timestamp = Math.floor(Date.now() / 1000);
    // Cloudinary signature: SHA-1 of "timestamp=<ts><api_secret>"
    const signature = crypto
      .createHash("sha1")
      .update(`timestamp=${timestamp}${API_SECRET}`)
      .digest("hex");

    res.json({ timestamp, signature, apiKey: API_KEY, cloudName: CLOUD_NAME });
  })
);

export default router;
