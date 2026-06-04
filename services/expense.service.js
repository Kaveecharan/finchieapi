import { expenseRepository } from "../repositories/expense.repository.js";
import { AppError } from "../errors/AppError.js";
import { buildExpenseFilter, buildSort } from "../utils/queryBuilder.js";
import { parsePagination, buildPaginationMeta } from "../utils/pagination.js";
import { analyticsService } from "./analytics.service.js";

export const expenseService = {
  list: async (userId, query) => {
    const { page, limit, skip } = parsePagination(query);
    const filter = buildExpenseFilter(userId, query);
    const sort = buildSort(query.sortField, query.sortOrder);

    const [items, total] = await expenseRepository.findPaginated(filter, sort, skip, limit);

    return {
      items,
      pagination: buildPaginationMeta(total, page, limit),
    };
  },

  getOne: async (id, userId) => {
    const expense = await expenseRepository.findById(id, userId);
    if (!expense) throw new AppError(404, "Expense not found", "NOT_FOUND");
    return expense;
  },

  create: async (userId, data) => {
    const amount    = Number(data.amount);
    const available = await analyticsService.getAvailableBalance(userId);
    if (amount > available) {
      throw new AppError(
        `Insufficient balance. You have ${Math.max(0, available).toFixed(2)} available.`,
        400,
        "INSUFFICIENT_BALANCE"
      );
    }
    return expenseRepository.create({ ...data, userId, date: new Date(data.date) });
  },

  update: async (id, userId, data) => {
    if (data.date) data.date = new Date(data.date);
    const updated = await expenseRepository.update(id, userId, data);
    if (!updated) throw new AppError(404, "Expense not found", "NOT_FOUND");
    return updated;
  },

  delete: async (id, userId) => {
    const deleted = await expenseRepository.delete(id, userId);
    if (!deleted) throw new AppError(404, "Expense not found", "NOT_FOUND");
  },
};
