import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import User from "../models/User.js";

const router = express.Router();

router.use(authenticate);

// Register or replace the caller's Expo push token.
// The client sends its token on every app launch so we always have the latest.
router.post(
  "/push-token",
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "token is required" });
    }

    await User.updateOne(
      { userId: req.user.userId },
      // $addToSet prevents duplicates; keep max last 3 tokens per user (multiple devices)
      { $addToSet: { pushTokens: token } }
    );

    res.json({ success: true });
  })
);

export default router;
