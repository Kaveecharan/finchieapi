import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const StaffInviteSchema = new mongoose.Schema(
  {
    inviteId: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
      immutable: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["admin", "superAdmin", "affiliate"],
      required: true,
    },
    // SHA-256 hash of the raw token — raw token only exists in the email link
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },

    // Set when the invite is accepted
    usedAt:    { type: Date, default: null },
    usedBy:    { type: String, default: null }, // userId of created staff member

    // Soft revocation by superAdmin before use
    revokedAt: { type: Date, default: null },

    // Who sent this invite
    createdBy: { type: String, required: true }, // userId of inviter
    createdByEmail: { type: String },
  },
  { timestamps: true }
);

// TTL index: MongoDB automatically removes documents 1 hour after expiry
StaffInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });
StaffInviteSchema.index({ createdAt: -1 });

StaffInviteSchema.virtual("isExpired").get(function () {
  return this.expiresAt < new Date();
});

StaffInviteSchema.virtual("isValid").get(function () {
  return !this.usedAt && !this.revokedAt && this.expiresAt > new Date();
});

export default mongoose.model("StaffInvite", StaffInviteSchema);
