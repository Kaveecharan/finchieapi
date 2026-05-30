import Expense from "../models/Expense.js";

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

  // Aggregation: expense totals grouped by category for a date range
  aggregateByCategory: (userId, start, end) =>
    Expense.aggregate([
      { $match: { userId, date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { id: "$category._id", name: "$category.name" },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]),

  // Aggregation: top N items by total spend
  aggregateTopItems: (userId, start, end, limit = 10) =>
    Expense.aggregate([
      { $match: { userId, date: { $gte: start, $lte: end } } },
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

  // Aggregation: monthly totals for trend chart (last N months)
  aggregateMonthlyTrend: (userId, start) =>
    Expense.aggregate([
      { $match: { userId, date: { $gte: start } } },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
          },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),

  // Total sum for a given filter (used for monthly summary)
  sumByFilter: (filter) =>
    Expense.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),

  // Returns every distinct { year, month } pair that has at least one expense.
  aggregateMonths: (userId) =>
    Expense.aggregate([
      { $match: { userId } },
      { $group: { _id: { year: { $year: "$date" }, month: { $month: "$date" } } } },
      { $project: { _id: 0, year: "$_id.year", month: "$_id.month" } },
    ]),
};
