import { incomeRepository } from "../repositories/income.repository.js";
import { AppError } from "../errors/AppError.js";
import { buildIncomeFilter, buildSort } from "../utils/queryBuilder.js";
import { parsePagination, buildPaginationMeta } from "../utils/pagination.js";

// ISO date string comparison is timezone-neutral (same logic as expense.service)
const todayISO = () => new Date().toISOString().slice(0, 10);
const isFutureDate = (date) => new Date(date).toISOString().slice(0, 10) > todayISO();

export const incomeService = {
  list: async (userId, query) => {
    const { page, limit, skip } = parsePagination(query);
    const filter = buildIncomeFilter(userId, query);
    const sort = buildSort(query.sortField, query.sortOrder);

    const [items, total] = await incomeRepository.findPaginated(filter, sort, skip, limit);

    return {
      items,
      pagination: buildPaginationMeta(total, page, limit),
    };
  },

  getOne: async (id, userId) => {
    const income = await incomeRepository.findById(id, userId);
    if (!income) throw new AppError("Income record not found", 404, "NOT_FOUND");
    return income;
  },

  create: async (userId, data) => {
    const pending = isFutureDate(data.date);
    return incomeRepository.create({
      ...data,
      userId,
      date: new Date(data.date),
      status: pending ? "pending" : "active",
    });
  },

  // Approve a pending income: flip status to active.
  // No balance check needed — income adds to balance rather than deducting.
  approve: async (id, userId) => {
    const income = await incomeRepository.findById(id, userId);
    if (!income) throw new AppError("Income record not found", 404, "NOT_FOUND");
    if (income.status !== "pending")
      throw new AppError("Transaction is already active", 400, "INVALID_STATE");
    return incomeRepository.update(id, userId, { status: "active" });
  },

  update: async (id, userId, data) => {
    if (data.date) data.date = new Date(data.date);
    const updated = await incomeRepository.update(id, userId, data);
    if (!updated) throw new AppError("Income record not found", 404, "NOT_FOUND");
    return updated;
  },

  delete: async (id, userId) => {
    const deleted = await incomeRepository.delete(id, userId);
    if (!deleted) throw new AppError("Income record not found", 404, "NOT_FOUND");
  },
};
