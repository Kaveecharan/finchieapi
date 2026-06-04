import SavingDeposit from "../models/SavingDeposit.js";

export const savingDepositRepository = {
  findByGoal: (goalId) =>
    SavingDeposit.find({ goalId }).sort({ createdAt: -1 }).lean(),

  findById: (id) => SavingDeposit.findById(id).lean(),

  create: (data) => SavingDeposit.create(data),

  update: (id, data) =>
    SavingDeposit.findByIdAndUpdate(id, { $set: data }, { new: true }).lean(),

  delete: (id) => SavingDeposit.findByIdAndDelete(id),

  deleteByGoal: (goalId) => SavingDeposit.deleteMany({ goalId }),
};
