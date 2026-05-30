import { incomeRepository } from "../repositories/income.repository.js";
import { AppError } from "../errors/AppError.js";
import { buildIncomeFilter, buildSort } from "../utils/queryBuilder.js";
import { parsePagination, buildPaginationMeta } from "../utils/pagination.js";

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
    if (!income) throw new AppError(404, "Income record not found", "NOT_FOUND");
    return income;
  },

  create: async (userId, data) => {
    const payload = {
      ...data,
      userId,
      date: new Date(data.date),
    };
    return incomeRepository.create(payload);
  },

  update: async (id, userId, data) => {
    if (data.date) data.date = new Date(data.date);
    const updated = await incomeRepository.update(id, userId, data);
    if (!updated) throw new AppError(404, "Income record not found", "NOT_FOUND");
    return updated;
  },

  delete: async (id, userId) => {
    const deleted = await incomeRepository.delete(id, userId);
    if (!deleted) throw new AppError(404, "Income record not found", "NOT_FOUND");
  },
};
