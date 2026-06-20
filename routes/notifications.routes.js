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
    if (!/^ExponentPushToken\[.+\]$/.test(token)) {
      return res.status(400).json({ error: "Invalid push token format" });
    }

    // Pipeline update: deduplicate with $setUnion then cap at 5 most-recent tokens.
    // Atomic — no separate trim step needed. Prevents unbounded document growth.
    await User.updateOne(
      { userId: req.user.userId },
      [
        {
          $set: {
            pushTokens: {
              $slice: [
                { $setUnion: [{ $ifNull: ["$pushTokens", []] }, [token]] },
                -5,
              ],
            },
          },
        },
      ]
    );

    res.json({ success: true });
  })
);

export default router;
