import Expense from "../models/Expense.js";

// Single source of truth: all analytics/aggregate queries exclude pending transactions.
// Existing documents without a status field are treated as active by $ne semantics.
const ACTIVE = { status: { $ne: "pending" } };

export const expenseRepository = {
  findPaginated: (filter, sort, skip, limit) =>
    Promise.all([
      Expense.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Expense.countDocuments(filter),
    ]),

  findById: (id, userId) =>
    Expense.findOne({ _id: id, userId }).lean(),

  create: (data) => Expense.create(data),

  update: (id, userId, data) =>
    Expense.findOneAndUpdate(
      { _id: id, userId },
      { $set: data },
      { new: true, runValidators: true }
    ).lean(),

  delete: (id, userId) =>
    Expense.findOneAndDelete({ _id: id, userId }),

  aggregateByCategory: (userId, start, end) =>
    Expense.aggregate([
      { $match: { userId, ...ACTIVE, date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { id: "$category._id", name: "$category.name" },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]),

  aggregateTopItems: (userId, start, end, limit = 10) =>
    Expense.aggregate([
      { $match: { userId, ...ACTIVE, date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$itemName",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
          category: { $first: "$category.name" },
        },
      },
      { $sort: { total: -1 } },
      { $limit: limit },
    ]),

  aggregateMonthlyTrend: (userId, start) =>
    Expense.aggregate([
      { $match: { userId, ...ACTIVE, date: { $gte: start } } },
      {
        $group: {
          _id: { year: { $year: "$date" }, month: { $month: "$date" } },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),

  // ACTIVE injected here so all callers (analytics, balance checks) automatically exclude pending
  sumByFilter: (filter) =>
    Expense.aggregate([
      { $match: { ...filter, ...ACTIVE } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),

  aggregateMonths: (userId) =>
    Expense.aggregate([
      { $match: { userId, ...ACTIVE } },
      { $group: { _id: { year: { $year: "$date" }, month: { $month: "$date" } } } },
      { $project: { _id: 0, year: "$_id.year", month: "$_id.month" } },
    ]),
};
