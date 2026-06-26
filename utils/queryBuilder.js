import mongoose from "mongoose";

// Builds a MongoDB filter object from validated query params.
// Keeps controllers thin — no raw query logic leaks up.
export const buildExpenseFilter = (userId, params = {}) => {
  const filter = { userId };

  if (params.startDate || params.endDate) {
    filter.date = {};
    if (params.startDate) filter.date.$gte = new Date(params.startDate);
    if (params.endDate) {
      const end = new Date(params.endDate);
      end.setHours(23, 59, 59, 999);
      filter.date.$lte = end;
    }
  }

  if (params.categoryId) {
    filter["category._id"] = new mongoose.Types.ObjectId(params.categoryId);
  }

  if (params.subCategoryId) {
    filter["subCategory._id"] = new mongoose.Types.ObjectId(params.subCategoryId);
  }

  if (params.minAmount !== undefined || params.maxAmount !== undefined) {
    filter.amount = {};
    if (params.minAmount !== undefined) filter.amount.$gte = Number(params.minAmount);
    if (params.maxAmount !== undefined) filter.amount.$lte = Number(params.maxAmount);
  }

  // "pending" = exact match; "active" uses $ne so legacy docs without the field still appear
  if (params.status === "pending") {
    filter.status = "pending";
  } else if (params.status === "active") {
    filter.status = { $ne: "pending" };
  }

  if (params.itemName) {
    const esc = params.itemName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.itemName = { $regex: `^${esc}$`, $options: "i" };
  }

  if (params.search) {
    const searchEsc = params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { itemName: { $regex: searchEsc, $options: "i" } },
      { note: { $regex: searchEsc, $options: "i" } },
    ];
  }

  return filter;
};

export const buildIncomeFilter = (userId, params = {}) => {
  const filter = { userId };

  if (params.startDate || params.endDate) {
    filter.date = {};
    if (params.startDate) filter.date.$gte = new Date(params.startDate);
    if (params.endDate) {
      const end = new Date(params.endDate);
      end.setHours(23, 59, 59, 999);
      filter.date.$lte = end;
    }
  }

  if (params.type) {
    filter.type = { $regex: params.type, $options: "i" };
  }

  if (params.categoryId) {
    filter["category._id"] = new mongoose.Types.ObjectId(params.categoryId);
  }

  if (params.whose) {
    filter.whose = { $regex: params.whose, $options: "i" };
  }

  if (params.minAmount !== undefined || params.maxAmount !== undefined) {
    filter.amount = {};
    if (params.minAmount !== undefined) filter.amount.$gte = Number(params.minAmount);
    if (params.maxAmount !== undefined) filter.amount.$lte = Number(params.maxAmount);
  }

  if (params.status === "pending") {
    filter.status = "pending";
  } else if (params.status === "active") {
    filter.status = { $ne: "pending" };
  }

  if (params.search) {
    const searchEsc = params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { whose: { $regex: searchEsc, $options: "i" } },
      { note: { $regex: searchEsc, $options: "i" } },
      { type: { $regex: searchEsc, $options: "i" } },
    ];
  }

  return filter;
};

// Returns the sort object for common sort options.
// Default is createdAt desc so the most recently added entry always appears first.
// For non-createdAt primary sorts, createdAt: -1 is added as a tiebreaker.
export const buildSort = (sortField = "createdAt", sortOrder = "desc") => {
  const direction = sortOrder === "asc" ? 1 : -1;
  const allowed = ["date", "amount", "itemName", "type", "whose", "createdAt"];
  const field = allowed.includes(sortField) ? sortField : "createdAt";
  const sort = { [field]: direction };
  if (field !== "createdAt") sort.createdAt = -1;
  return sort;
};

// Builds a date range for a given ISO month string (e.g. "2025-05")
export const monthToDateRange = (month) => {
  const [year, m] = month.split("-").map(Number);
  const start = new Date(year, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, m, 0, 23, 59, 59, 999);
  return { start, end };
};

// Builds date range for current calendar month
export const currentMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
};
