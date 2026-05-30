import Session from "../models/Session.js";

export const sessionRepository = {
  create: (data) => Session.create(data),

  findBySessionId: (sessionId) =>
    Session.findOne({ sessionId, isRevoked: false }).select("+tokenHash"),

  findActiveByUserId: (userId) =>
    Session.find({ userId, isRevoked: false, expiresAt: { $gt: new Date() } })
      .select("-tokenHash")
      .sort({ lastUsedAt: -1 }),

  countActiveByUserId: (userId) =>
    Session.countDocuments({ userId, isRevoked: false, expiresAt: { $gt: new Date() } }),

  // expiresAt is optional — pass it on rotation to slide the session TTL forward.
  updateTokenHash: (sessionId, tokenHash, expiresAt) =>
    Session.updateOne(
      { sessionId },
      { tokenHash, lastUsedAt: new Date(), ...(expiresAt && { expiresAt }) }
    ),

  revokeSession: (sessionId, reason = "logout") =>
    Session.updateOne({ sessionId }, { isRevoked: true, revokedReason: reason }),

  // Revoke every token in a family — called on replay detection
  revokeByFamilyId: (familyId, reason = "token_replay") =>
    Session.updateMany({ familyId }, { isRevoked: true, revokedReason: reason }),

  revokeAllForUser: (userId, reason = "logout_all") =>
    Session.updateMany({ userId, isRevoked: false }, { isRevoked: true, revokedReason: reason }),

  revokeAllForUserExcept: (userId, sessionId, reason = "password_changed") =>
    Session.updateMany(
      { userId, isRevoked: false, sessionId: { $ne: sessionId } },
      { isRevoked: true, revokedReason: reason }
    ),
};
