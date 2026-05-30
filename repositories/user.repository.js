import User from "../models/User.js";

const activeFilter = { isActive: true, deletedAt: null };

export const userRepository = {
  findById: (userId) =>
    User.findOne({ userId, ...activeFilter }),

  findByEmail: (email) =>
    User.findOne({ email: email.toLowerCase(), ...activeFilter }),

  findByEmailWithSecrets: (email) =>
    User.findOne({ email: email.toLowerCase(), ...activeFilter }).select(
      "+passwordHash +passwordHistory +mfaSecret +mfaBackupCodes +verificationCodeHash +resetCodeHash"
    ),

  findByIdWithSecrets: (userId) =>
    User.findOne({ userId, ...activeFilter }).select(
      "+passwordHash +passwordHistory +mfaSecret +mfaBackupCodes +verificationCodeHash +resetCodeHash"
    ),

  findByUsername: (username) =>
    User.findOne({ username: username.toLowerCase(), ...activeFilter }),

  findByGoogleId: (googleId) =>
    User.findOne({ googleId, ...activeFilter }),

  create: (data) => User.create(data),

  save: (user) => user.save(),

  // ─── Atomic verification operations ───────────────────────────────────────
  //
  // Using findByIdAndUpdate instead of document.save() for two reasons:
  //
  // 1. Atomicity: the OTP clear + isEmailVerified = true happen in a single
  //    DB round-trip. A concurrent request cannot see a half-updated document.
  //
  // 2. Fresh document: the { new: true } option returns the document as MongoDB
  //    has it after the update — no risk of Mongoose in-memory state artifacts
  //    from the pre-save document (which previously caused userId to appear
  //    undefined when passed to createSession after a multi-field save()).
  //
  // Query is by MongoDB _id (ObjectId), not our custom userId string, because
  // _id is always present and indexed as the primary key.
  markEmailVerified: (mongoId) =>
    User.findByIdAndUpdate(
      mongoId,
      {
        $set: { isEmailVerified: true, verificationAttempts: 0 },
        $unset: { verificationCodeHash: "", verificationCodeExpires: "" },
      },
      { new: true }   // return post-update document; runValidators off (we're removing OTP fields)
    ),

  // Atomic attempt counters — prevent TOCTOU races on concurrent requests.
  incrementVerificationAttempts: (mongoId) =>
    User.findByIdAndUpdate(mongoId, { $inc: { verificationAttempts: 1 } }),

  incrementResetAttempts: (mongoId) =>
    User.findByIdAndUpdate(mongoId, { $inc: { resetAttempts: 1 } }),

  deleteUnverifiedExpired: (cutoffDate) =>
    User.deleteMany({ isEmailVerified: false, createdAt: { $lt: cutoffDate } }),
};
