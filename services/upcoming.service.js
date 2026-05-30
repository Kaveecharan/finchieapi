import Expense from "../models/Expense.js";
import Income from "../models/Income.js";
import { upcomingRepository } from "../repositories/upcoming.repository.js";
import { AppError } from "../errors/AppError.js";
import { parsePagination, buildPaginationMeta } from "../utils/pagination.js";

export const upcomingService = {
  list: async (userId, query) => {
    const { page, limit, skip } = parsePagination(query);
    const filter = { userId, status: query.status ?? "pending" };
    if (query.transactionType) filter.transactionType = query.transactionType;

    const [items, total] = await upcomingRepository.findPaginated(filter, skip, limit);
    return { items, pagination: buildPaginationMeta(total, page, limit) };
  },

  getOne: async (id, userId) => {
    const item = await upcomingRepository.findById(id, userId);
    if (!item) throw new AppError(404, "Upcoming transaction not found", "NOT_FOUND");
    return item;
  },

  create: async (userId, data) => {
    const payload = { ...data, userId, date: new Date(data.date) };
    return upcomingRepository.create(payload);
  },

  update: async (id, userId, data) => {
    if (data.date) data.date = new Date(data.date);
    const updated = await upcomingRepository.update(id, userId, data);
    if (!updated) throw new AppError(404, "Upcoming transaction not found or already actioned", "NOT_FOUND");
    return updated;
  },

  delete: async (id, userId) => {
    const deleted = await upcomingRepository.delete(id, userId);
    if (!deleted) throw new AppError(404, "Upcoming transaction not found", "NOT_FOUND");
  },

  // Approve: create the actual expense or income, mark upcoming as approved.
  approve: async (id, userId) => {
    const upcoming = await upcomingRepository.findById(id, userId);
    if (!upcoming) throw new AppError(404, "Upcoming transaction not found", "NOT_FOUND");
    if (upcoming.status !== "pending")
      throw new AppError(400, `Transaction is already ${upcoming.status}`, "INVALID_STATE");

    const approvedAt = new Date();
    let created;
    if (upcoming.transactionType === "expense") {
      created = await Expense.create({
        userId,
        date:        approvedAt,
        amount:      upcoming.amount,
        itemName:    upcoming.itemName,
        category:    upcoming.category,
        subCategory: upcoming.subCategory ?? null,
        note:        upcoming.note ?? "",
        images:      upcoming.images ?? [],
      });
    } else {
      created = await Income.create({
        userId,
        date:     approvedAt,
        amount:   upcoming.amount,
        type:     upcoming.incomeType,
        category: upcoming.category,
        whose:    upcoming.whose ?? "",
        note:     upcoming.note ?? "",
        images:   upcoming.images ?? [],
      });
    }

    await upcomingRepository.setStatus(id, userId, "approved");
    return { created };
  },

  // Decline: mark as declined (auto-cleaned after 3 days by cron).
  decline: async (id, userId) => {
    const updated = await upcomingRepository.setStatus(id, userId, "declined", {
      declinedAt: new Date(),
    });
    if (!updated) throw new AppError(404, "Upcoming transaction not found or already actioned", "NOT_FOUND");
    return updated;
  },
};
