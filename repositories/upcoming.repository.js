import UpcomingTransaction from "../models/UpcomingTransaction.js";

export const upcomingRepository = {
  findPaginated: (filter, skip, limit) =>
    Promise.all([
      UpcomingTransaction.find(filter).sort({ date: 1 }).skip(skip).limit(limit).lean(),
      UpcomingTransaction.countDocuments(filter),
    ]),

  findById: (id, userId) =>
    UpcomingTransaction.findOne({ _id: id, userId }).lean(),

  create: (data) => UpcomingTransaction.create(data),

  update: (id, userId, data) =>
    UpcomingTransaction.findOneAndUpdate(
      { _id: id, userId, status: "pending" },
      { $set: data },
      { new: true, runValidators: true }
    ).lean(),

  delete: (id, userId) =>
    UpcomingTransaction.findOneAndDelete({ _id: id, userId }),

  // Set status and optional extra fields atomically
  setStatus: (id, userId, status, extra = {}) =>
    UpcomingTransaction.findOneAndUpdate(
      { _id: id, userId, status: "pending" },
      { $set: { status, ...extra } },
      { new: true }
    ).lean(),

  // For cron: all pending transactions due on a specific day
  findPendingDueOn: (dayStart, dayEnd) =>
    UpcomingTransaction.find({
      status: "pending",
      date: { $gte: dayStart, $lt: dayEnd },
    }).lean(),

  // For cron morning/evening notification checks
  findPendingDueOnMissingMorning: (dayStart, dayEnd) =>
    UpcomingTransaction.find({
      status: "pending",
      date: { $gte: dayStart, $lt: dayEnd },
      morningNotifSent: false,
    }).lean(),

  findPendingDueOnMissingEvening: (dayStart, dayEnd) =>
    UpcomingTransaction.find({
      status: "pending",
      date: { $gte: dayStart, $lt: dayEnd },
      eveningNotifSent: false,
    }).lean(),

  markMorningNotifSent: (id) =>
    UpcomingTransaction.updateOne({ _id: id }, { $set: { morningNotifSent: true } }),

  markEveningNotifSent: (id) =>
    UpcomingTransaction.updateOne({ _id: id }, { $set: { eveningNotifSent: true } }),

  // Cleanup: remove declined items older than cutoff
  deleteDeclinedBefore: (cutoff) =>
    UpcomingTransaction.deleteMany({ status: "declined", declinedAt: { $lte: cutoff } }),
};
