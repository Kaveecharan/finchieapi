import { savingGoalRepository }   from "../repositories/savingGoal.repository.js";
import { savingDepositRepository } from "../repositories/savingDeposit.repository.js";
import { AppError }                from "../errors/AppError.js";
import { analyticsService }        from "./analytics.service.js";

const requireGoal = async (userId, goalId) => {
  const goal = await savingGoalRepository.findById(goalId);
  if (!goal || goal.userId !== userId)
    throw new AppError("Saving goal not found", 404, "NOT_FOUND");
  return goal;
};

export const savingsService = {
  getSavings: async (userId) => {
    const all = await savingGoalRepository.findAll(userId);
    return {
      active:    all.filter((g) => g.status === "active"),
      completed: all.filter((g) => g.status === "completed"),
    };
  },

  createGoal: async (userId, body) => {
    const { title, plannedAmount, deadline, note } = body;
    if (!title?.trim())
      throw new AppError("Title is required", 400, "VALIDATION_ERROR");
    if (!plannedAmount || Number(plannedAmount) <= 0)
      throw new AppError("Planned amount must be greater than 0", 400, "VALIDATION_ERROR");
    if (!deadline)
      throw new AppError("Deadline is required", 400, "VALIDATION_ERROR");

    return savingGoalRepository.create({
      userId,
      title:         title.trim(),
      plannedAmount: Number(plannedAmount),
      currentAmount: 0,
      deadline:      new Date(deadline),
      note:          note?.trim() ?? "",
    });
  },

  updateGoal: async (userId, goalId, body) => {
    const goal = await requireGoal(userId, goalId);
    if (goal.status === "completed")
      throw new AppError("Completed goals cannot be edited", 400, "INVALID_STATE");

    const updates = {};
    if (body.title    !== undefined) updates.title    = body.title.trim();
    if (body.deadline !== undefined) updates.deadline = new Date(body.deadline);
    if (body.note     !== undefined) updates.note     = body.note.trim();

    return savingGoalRepository.update(goalId, updates);
  },

  addDeposit: async (userId, goalId, body) => {
    const goal = await requireGoal(userId, goalId);
    if (goal.status === "completed")
      throw new AppError("Cannot deposit into a completed goal", 400, "INVALID_STATE");

    const amount = Number(body.amount);
    if (!amount || amount <= 0)
      throw new AppError("Deposit amount must be greater than 0", 400, "VALIDATION_ERROR");

    const available = await analyticsService.getAvailableBalance(userId);
    if (amount > available) {
      throw new AppError(
        `Insufficient balance. You have ${Math.max(0, available).toFixed(2)} available.`,
        400,
        "INSUFFICIENT_BALANCE"
      );
    }

    const deposit = await savingDepositRepository.create({
      goalId,
      userId,
      amount,
      note: body.note?.trim() ?? "",
    });

    const updatedGoal = await savingGoalRepository.incrementAmount(goalId, amount);
    return { goal: updatedGoal, deposit };
  },

  removeDeposit: async (userId, goalId, depositId) => {
    const goal = await requireGoal(userId, goalId);
    if (goal.status === "completed")
      throw new AppError("Cannot modify a completed goal", 400, "INVALID_STATE");

    const deposit = await savingDepositRepository.findById(depositId);
    if (!deposit || String(deposit.goalId) !== String(goalId))
      throw new AppError("Deposit not found", 404, "NOT_FOUND");

    await savingDepositRepository.delete(depositId);
    // Deposits add to currentAmount → deletion subtracts. Deductions subtract → deletion adds back.
    const delta     = deposit.type === "deduction" ? deposit.amount : -deposit.amount;
    const newAmount = Math.max(0, goal.currentAmount + delta);
    const updatedGoal = await savingGoalRepository.update(goalId, { currentAmount: newAmount });
    return { goal: updatedGoal };
  },

  finishGoal: async (userId, goalId) => {
    const goal = await requireGoal(userId, goalId);
    if (goal.status === "completed")
      throw new AppError("Goal is already completed", 400, "INVALID_STATE");
    return savingGoalRepository.complete(goalId);
  },

  deleteGoal: async (userId, goalId) => {
    await requireGoal(userId, goalId);
    await savingDepositRepository.deleteByGoal(goalId);
    await savingGoalRepository.delete(goalId);
  },

  getDeposits: async (userId, goalId) => {
    await requireGoal(userId, goalId);
    return savingDepositRepository.findByGoal(goalId);
  },

  // Returns a single goal with its full contribution history (deposits + transfers).
  getGoalDetail: async (userId, goalId) => {
    const goal = await requireGoal(userId, goalId);
    const records = await savingDepositRepository.findByGoal(goalId);
    return {
      ...goal,
      total:       goal.currentAmount,
      targetDate:  goal.deadline,
      contributions: records.map((d) => ({
        _id:    d._id,
        type:   d.type ?? "deposit",
        amount: d.amount,
        note:   d.note,
        date:   d.createdAt,
      })),
    };
  },

  // Transfer amount from savings goal back to available balance.
  // Balance updates implicitly: availableBalance = income - expenses - totalSavings,
  // so decrementing currentAmount increases availableBalance automatically.
  deductSavings: async (userId, goalId, body) => {
    const goal = await requireGoal(userId, goalId);
    if (goal.status === "completed")
      throw new AppError("Cannot modify a completed goal", 400, "INVALID_STATE");

    const amount = Number(body.amount);
    if (!amount || amount <= 0)
      throw new AppError("Amount must be greater than 0", 400, "VALIDATION_ERROR");
    if (amount > goal.currentAmount)
      throw new AppError(
        `Cannot transfer more than saved. Available: ${goal.currentAmount.toFixed(2)}`,
        400,
        "INSUFFICIENT_SAVINGS"
      );

    const [deduction, updatedGoal] = await Promise.all([
      savingDepositRepository.create({ goalId, userId, amount, type: "deduction", note: body.note?.trim() ?? "" }),
      savingGoalRepository.incrementAmount(goalId, -amount),
    ]);

    return { goal: { ...updatedGoal, total: updatedGoal.currentAmount }, deduction };
  },

  // Update the amount/note of an existing deposit entry.
  // Adjusts goal.currentAmount by the difference.
  updateDeposit: async (userId, depositId, body) => {
    const deposit = await savingDepositRepository.findById(depositId);
    if (!deposit || deposit.userId !== userId)
      throw new AppError("Deposit not found", 404, "NOT_FOUND");
    if (deposit.type === "deduction")
      throw new AppError("Transfer records cannot be edited", 400, "INVALID_STATE");

    const newAmount = Number(body.amount);
    if (!newAmount || newAmount <= 0)
      throw new AppError("Amount must be greater than 0", 400, "VALIDATION_ERROR");

    const goal = await savingGoalRepository.findById(String(deposit.goalId));
    if (!goal || goal.userId !== userId)
      throw new AppError("Saving goal not found", 404, "NOT_FOUND");
    if (goal.status === "completed")
      throw new AppError("Cannot modify a completed goal", 400, "INVALID_STATE");

    const diff = newAmount - deposit.amount;
    await savingDepositRepository.update(depositId, { amount: newAmount, note: body.note?.trim() ?? "" });
    const updatedGoal = await savingGoalRepository.incrementAmount(String(deposit.goalId), diff);
    return { goal: updatedGoal };
  },

  getTotalActiveSavings: (userId) => savingGoalRepository.totalCurrentByUser(userId),
};
