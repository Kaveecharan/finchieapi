import User from "../models/User.js";
import { userRepository } from "../repositories/user.repository.js";
import { sessionRepository } from "../repositories/session.repository.js";
import { verifyPassword } from "../security/password.js";
import { pepperPassword } from "../utils/crypto.js";
import { AppError, ConflictError, ValidationError } from "../errors/AppError.js";

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const CHANGE_LIMIT = 3;

// Filter an array of Date timestamps to those in the last 6 months
const recentChanges = (log = []) => {
  const cutoff = new Date(Date.now() - SIX_MONTHS_MS);
  return log.filter((d) => new Date(d) > cutoff);
};

export const profileService = {
  getProfile: async (userId) => {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError(404, "User not found", "NOT_FOUND");
    return user;
  },

  updateProfile: async (userId, data) => {
    // Check username uniqueness if being changed
    if (data.username) {
      const existing = await User.findOne({ username: data.username.toLowerCase(), userId: { $ne: userId } });
      if (existing) throw new ConflictError("Username already taken");
      data.username = data.username.toLowerCase();
    }
    if (data.dateOfBirth) data.dateOfBirth = new Date(data.dateOfBirth);

    const updated = await User.findOneAndUpdate(
      { userId },
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!updated) throw new AppError(404, "User not found", "NOT_FOUND");
    return updated;
  },

  updateAvatar: async (userId, avatarUrl) => {
    const updated = await User.findOneAndUpdate(
      { userId },
      { $set: { avatarUrl } },
      { new: true }
    );
    if (!updated) throw new AppError(404, "User not found", "NOT_FOUND");
    return updated;
  },

  updateEmail: async (userId, newEmail, password) => {
    // Load user with secrets to verify password
    const user = await User.findOne({ userId }).select("+passwordHash +emailChangeLog");
    if (!user) throw new AppError(404, "User not found", "NOT_FOUND");

    // Rate limit: max 3 changes in 6 months
    const recent = recentChanges(user.emailChangeLog || []);
    if (recent.length >= CHANGE_LIMIT) {
      throw new ValidationError(`Email can only be changed ${CHANGE_LIMIT} times in 6 months. Try again later.`);
    }

    // Verify password
    if (!user.passwordHash) throw new ValidationError("Cannot change email on OAuth-only accounts");
    const pepperedPassword = pepperPassword(password);
    const valid = await verifyPassword(pepperedPassword, user.passwordHash);
    if (!valid) throw new AppError(401, "Incorrect password", "INVALID_CREDENTIALS");

    // Check email not already in use
    const conflict = await User.findOne({ email: newEmail.toLowerCase(), userId: { $ne: userId } });
    if (conflict) throw new ConflictError("Email already in use");

    const updated = await User.findOneAndUpdate(
      { userId },
      {
        $set: { email: newEmail.toLowerCase(), isEmailVerified: false },
        $push: { emailChangeLog: new Date() },
      },
      { new: true }
    );
    return updated;
  },

  updatePhone: async (userId, phoneNumber, countryCode) => {
    const user = await User.findOne({ userId }).select("+phoneChangeLog");
    if (!user) throw new AppError(404, "User not found", "NOT_FOUND");

    // Rate limit
    const recent = recentChanges(user.phoneChangeLog || []);
    if (recent.length >= CHANGE_LIMIT) {
      throw new ValidationError(`Phone can only be changed ${CHANGE_LIMIT} times in 6 months.`);
    }

    const updated = await User.findOneAndUpdate(
      { userId },
      {
        $set: { phoneNumber: phoneNumber ?? "", countryCode: countryCode ?? "" },
        $push: { phoneChangeLog: new Date() },
      },
      { new: true }
    );
    return updated;
  },

  deactivate: async (userId, password) => {
    const user = await User.findOne({ userId }).select("+passwordHash");
    if (!user) throw new AppError(404, "User not found", "NOT_FOUND");
    if (user.status === "deactivated") throw new AppError(400, "Account already deactivated", "INVALID_STATE");

    // Verify password
    if (!user.passwordHash) throw new ValidationError("Cannot deactivate OAuth-only accounts via password");
    const pepperedPassword = pepperPassword(password);
    const valid = await verifyPassword(pepperedPassword, user.passwordHash);
    if (!valid) throw new AppError(401, "Incorrect password", "INVALID_CREDENTIALS");

    // Deactivate: keep data for 30 days then auto-delete
    const deletedAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await User.findOneAndUpdate(
      { userId },
      { $set: { status: "deactivated", deactivatedAt: new Date(), deletedAt } }
    );

    // Revoke all sessions
    await sessionRepository.revokeAllForUser(userId, "deactivated");
  },
};
