import express from "express";
import crypto from "crypto";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";

const router = express.Router();

const CLOUD_NAME = env.CLOUDINARY_CLOUD_NAME;
const API_KEY    = env.CLOUDINARY_API_KEY;
const API_SECRET = env.CLOUDINARY_API_SECRET;

const UPLOAD_FOLDER       = "avatars";
const UPLOAD_FORMATS      = "jpg,jpeg,png,webp";

// POST /cloudinary/sign
// Returns a short-lived signed timestamp so the client can upload directly to
// Cloudinary without exposing the API secret in the app bundle.
// The signature covers folder + allowed_formats so the client cannot deviate
// from these constraints — any upload that changes these fields will be rejected.
router.post(
  "/sign",
  authenticate,
  asyncHandler(async (_req, res) => {
    const timestamp = Math.floor(Date.now() / 1000);
    // Params must be sorted alphabetically before signing (Cloudinary requirement)
    const paramString = `allowed_formats=${UPLOAD_FORMATS}&folder=${UPLOAD_FOLDER}&timestamp=${timestamp}`;
    const signature = crypto
      .createHash("sha1")
      .update(paramString + API_SECRET)
      .digest("hex");

    res.json({
      timestamp,
      signature,
      apiKey:          API_KEY,
      cloudName:       CLOUD_NAME,
      folder:          UPLOAD_FOLDER,
      allowedFormats:  UPLOAD_FORMATS,
    });
  })
);

export default router;
