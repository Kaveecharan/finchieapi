import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { getDefaultAvatarUrl } from "../utils/defaultAvatar.js";

const { Schema } = mongoose;

// ── Embedded settings sub-documents ──────────────────────────────────────────

const privacySchema = new Schema(
  {
    privateAccount: { type: Boolean, default: false },
    showActivity: { type: Boolean, default: true },
    commentPermission: {
      type: String,
      enum: ["everyone", "followers", "none"],
      default: "everyone",
    },
    tagPermission: {
      type: String,
      enum: ["everyone", "followers", "none"],
      default: "everyone",
    },
    mentionPermission: {
      type: String,
      enum: ["everyone", "followers", "none"],
      default: "everyone",
    },
  },
  { _id: false }
);

const notificationSettingsSchema = new Schema(
  {
    pushEnabled: { type: Boolean, default: true },
    likes: { type: Boolean, default: true },
    comments: { type: Boolean, default: true },
    replies: { type: Boolean, default: true },
    newFollowers: { type: Boolean, default: true },
    mentions: { type: Boolean, default: true },
    tags: { type: Boolean, default: true },
    albumActivity: { type: Boolean, default: true },
  },
  { _id: false }
);

const displaySettingsSchema = new Schema(
  {
    darkMode: { type: Boolean, default: false },
    fontSize: {
      type: String,
      enum: ["small", "medium", "large"],
      default: "medium",
    },
    dataSaver: { type: Boolean, default: false },
    autoplay: {
      type: String,
      enum: ["always", "wifi", "never"],
      default: "always",
    },
    reducedMotion: { type: Boolean, default: false },
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────

const UserSchema = new Schema(
  {
    userId: {
      type: String,
      default: uuidv4,
      required: true,
      immutable: true,
      unique: true,
      index: true,
    },

    // ── Auth ──────────────────────────────────────────────────
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // select: false — never returned in queries unless explicitly requested
    passwordHash: { type: String, select: false },
    // Last N hashed passwords; checked on password change to prevent cycling
    passwordHistory: { type: [String], select: false, default: [] },
    // Incremented on password change; embedded in access tokens so stale
    // tokens are detectable without a DB lookup
    passwordVersion: { type: Number, default: 0 },

    roles: {
      type: [String],
      default: ["user"],
      enum: ["user", "admin", "superAdmin", "affiliate"],
    },

    isEmailVerified: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },

    // ── OAuth ─────────────────────────────────────────────────
    googleId: { type: String, sparse: true, index: true },
    oauthOnly: { type: Boolean, default: false },

    // ── MFA ───────────────────────────────────────────────────
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, select: false },
    mfaBackupCodes: { type: [String], select: false, default: [] },

    // ── Email verification (signup) ───────────────────────────
    verificationCodeHash: { type: String, select: false },
    verificationCodeExpires: { type: Date },
    verificationAttempts: { type: Number, default: 0 },

    // ── Password reset ────────────────────────────────────────
    resetCodeHash: { type: String, select: false },
    resetCodeExpires: { type: Date },
    resetAttempts: { type: Number, default: 0 },

    // ── Email change verification ─────────────────────────────
    pendingEmail: { type: String, select: false, lowercase: true, trim: true },
    emailChangeCodeHash: { type: String, select: false },
    emailChangeCodeExpires: { type: Date, select: false },

    // ── Phone change verification ─────────────────────────────
    pendingPhone: { type: String, select: false },
    pendingCountryCode: { type: String, select: false },
    phoneChangeCodeHash: { type: String, select: false },
    phoneChangeCodeExpires: { type: Date, select: false },

    // ── Account deactivation OTP ──────────────────────────────
    deactivationCodeHash: { type: String, select: false },
    deactivationCodeExpires: { type: Date, select: false },

    // ── Core identity ─────────────────────────────────────────
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true },

    // Social-facing identity (distinct from firstName/lastName)
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },

    // ── Profile ───────────────────────────────────────────────
    website: { type: String, default: "" },
    // avatarUrl is NEVER null — pre-save hook and toJSON both enforce this.
    avatarUrl: { type: String },
    bannerUrl: { type: String },
    dateOfBirth: { type: Date },
    phoneNumber: { type: String },
    countryCode: { type: String },
    country: { type: String },
    address: { type: String },

    // ── Verification badge ────────────────────────────────────
    isVerified: { type: Boolean, default: false },
    verificationStatus: {
      type: String,
      enum: ["none", "pending", "verified", "rejected"],
      default: "none",
    },

    // ── Social graph counters (denormalized for O(1) profile reads) ──
    // Source of truth is the Follow collection; these are updated via $inc
    followersCount: { type: Number, default: 0, min: 0 },
    followingCount: { type: Number, default: 0, min: 0 },
    postsCount: { type: Number, default: 0, min: 0 },

    // ── Embedded settings (single-doc read on profile load) ───
    privacy: { type: privacySchema, default: () => ({}) },
    notificationSettings: { type: notificationSettingsSchema, default: () => ({}) },
    displaySettings: { type: displaySettingsSchema, default: () => ({}) },

    // ── Account lifecycle ─────────────────────────────────────
    status: {
      type: String,
      enum: ["active", "deactivated", "banned", "suspended"],
      default: "active",
      index: true,
    },
    deactivationReason: { type: String, select: false },
    deactivatedAt: { type: Date, select: false },
    bannedAt: { type: Date, select: false },
    bannedReason: { type: String, select: false },
    suspendedUntil: { type: Date },

    // ── Finance / profile extras ──────────────────────────────
    profession: { type: String, trim: true, maxlength: 100, default: "" },
    currency:   { type: String, trim: true, maxlength: 10,  default: "" },

    // Tracks timestamps of email/phone changes; used to enforce 3-per-6-months limit
    emailChangeLog: { type: [Date], default: [], select: false },
    phoneChangeLog: { type: [Date], default: [], select: false },

    // ── Activity tracking ─────────────────────────────────────
    lastActiveAt: { type: Date, default: Date.now },

    // ── Search history (max 20, per-user, cleared on demand) ──
    recentSearches: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => v.length <= 20,
        message: "Recent searches cannot exceed 20 entries",
      },
    },

    // One token per device (mobile may have multiple devices)
    pushTokens: { type: [String], default: [] },

    // Soft delete — preserve for audit trails
    deletedAt: { type: Date, index: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.passwordHash;
        delete ret.passwordHistory;
        delete ret.mfaSecret;
        delete ret.mfaBackupCodes;
        delete ret.verificationCodeHash;
        delete ret.resetCodeHash;
        delete ret.__v;
        // Guarantee avatarUrl is never null in any API response.
        // Handles legacy documents where avatarUrl was not stored.
        if (!ret.avatarUrl) {
          ret.avatarUrl = getDefaultAvatarUrl(ret.username ?? ret.userId);
        }
        return ret;
      },
    },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
UserSchema.index({ email: 1, isActive: 1 });
UserSchema.index({ status: 1, createdAt: -1 });
UserSchema.index({ lastActiveAt: -1 });
UserSchema.index({ isVerified: 1 });
// Supports /search/users — username, displayName, bio weighted search
UserSchema.index({ username: "text", displayName: "text" });
// TTL: auto-expire verification codes at the document level as a safety net
UserSchema.index({ verificationCodeExpires: 1 }, { expireAfterSeconds: 3600 });

// ── Avatar invariant ──────────────────────────────────────────────────────────
// Ensures avatarUrl is persisted for every document, including on creation and
// when a user removes their profile picture (sets avatarUrl to null/empty).
UserSchema.pre("save", function (next) {
  if (!this.avatarUrl) {
    this.avatarUrl = getDefaultAvatarUrl(this.username ?? this.userId);
  }
  next();
});

export default mongoose.model("User", UserSchema);
