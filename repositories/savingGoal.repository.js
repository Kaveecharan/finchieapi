import SavingGoal from "../models/SavingGoal.js";

export const savingGoalRepository = {
  findAll: (userId) =>
    SavingGoal.find({ userId }).sort({ createdAt: -1 }).lean(),

  findById: (id) => SavingGoal.findById(id).lean(),

  create: (data) => SavingGoal.create(data),

  update: (id, data) =>
    SavingGoal.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean(),

  incrementAmount: (id, delta) =>
    SavingGoal.findByIdAndUpdate(id, { $inc: { currentAmount: delta } }, { new: true }).lean(),

  complete: (id) =>
    SavingGoal.findByIdAndUpdate(
      id,
      { status: "completed", completedAt: new Date() },
      { new: true }
    ).lean(),

  delete: (id) => SavingGoal.findByIdAndDelete(id),

  // Sum of currentAmount across all active goals — used by analytics dashboard
  totalCurrentByUser: async (userId) => {
    const result = await SavingGoal.aggregate([
      { $match: { userId, status: "active" } },
      { $group: { _id: null, total: { $sum: "$currentAmount" } } },
    ]);
    return result[0]?.total ?? 0;
  },
};
