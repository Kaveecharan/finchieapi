import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const SessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      default: uuidv4,
      unique: true,
      immutable: true,
      index: true,
    },
    userId: { type: String, required: true, index: true },

    // familyId groups all tokens issued from one login event.
    // Replay of any token in a family revokes all tokens in that family,
    // even if some have already been rotated away.
    familyId: { type: String, required: true, index: true },

    // SHA256 of the JWT's jti claim — lets us verify the exact token without
    // storing the raw token in the DB
    tokenHash: { type: String, required: true, select: false },

    // Snapshot of user's passwordVersion at session creation.
    // If user.passwordVersion > session.passwordVersion, session was created
    // before the last password change and should be treated as stale.
    passwordVersion: { type: Number, required: true },

    device: {
      userAgent: String,
      ip: String,
      deviceId: String,
      platform: String,
    },

    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },

    isRevoked: { type: Boolean, default: false, index: true },
    revokedReason: { type: String },
  },
  { timestamps: true }
);

// MongoDB TTL index: auto-removes fully expired sessions
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ userId: 1, isRevoked: 1 });

export default mongoose.model("Session", SessionSchema);
