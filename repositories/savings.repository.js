import Saving from "../models/Saving.js";

export const savingRepository = {
  findAll: (userId) =>
    Saving.find({ userId }).sort({ createdAt: -1 }).lean(),

  findActive: (userId) =>
    Saving.find({ userId, status: "active" }).sort({ createdAt: -1 }).lean(),

  findById: (id) =>
    Saving.findById(id).lean(),

  create: (data) => Saving.create(data),

  update: (id, data) =>
    Saving.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean(),

  complete: (id) =>
    Saving.findByIdAndUpdate(
      id,
      { status: "completed", completedAt: new Date() },
      { new: true }
    ).lean(),

  delete: (id) => Saving.findByIdAndDelete(id),

  // Sum of amounts for all active savings — used by the analytics dashboard.
  totalActiveByUser: async (userId) => {
    const result = await Saving.aggregate([
      { $match: { userId, status: "active" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    return result[0]?.total ?? 0;
  },
};
