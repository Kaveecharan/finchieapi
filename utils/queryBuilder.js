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

  if (params.search) {
    filter.$or = [
      { itemName: { $regex: params.search, $options: "i" } },
      { note: { $regex: params.search, $options: "i" } },
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

  if (params.search) {
    filter.$or = [
      { whose: { $regex: params.search, $options: "i" } },
      { note: { $regex: params.search, $options: "i" } },
      { type: { $regex: params.search, $options: "i" } },
    ];
  }

  return filter;
};

// Returns the sort object for common sort options
export const buildSort = (sortField = "date", sortOrder = "desc") => {
  const direction = sortOrder === "asc" ? 1 : -1;
  const allowed = ["date", "amount", "itemName", "type", "whose"];
  const field = allowed.includes(sortField) ? sortField : "date";
  return { [field]: direction };
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
