import Income from "../models/Income.js";

export const incomeRepository = {
  findPaginated: (filter, sort, skip, limit) =>
    Promise.all([
      Income.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Income.countDocuments(filter),
    ]),

  findById: (id, userId) =>
    Income.findOne({ _id: id, userId }).lean(),

  create: (data) => Income.create(data),

  update: (id, userId, data) =>
    Income.findOneAndUpdate(
      { _id: id, userId },
      { $set: data },
      { new: true, runValidators: true }
    ).lean(),

  delete: (id, userId) =>
    Income.findOneAndDelete({ _id: id, userId }),

  // Aggregation: income grouped by type and category
  aggregateByType: (userId, start, end) =>
    Income.aggregate([
      { $match: { userId, date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { type: "$type", category: "$category.name" },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
          whose: { $addToSet: "$whose" },
        },
      },
      { $sort: { total: -1 } },
    ]),

  // Aggregation: income grouped by category only
  aggregateByCategory: (userId, start, end) =>
    Income.aggregate([
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

  // Monthly trend for last N months
  aggregateMonthlyTrend: (userId, start) =>
    Income.aggregate([
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

  sumByFilter: (filter) =>
    Income.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),

  aggregateMonths: (userId) =>
    Income.aggregate([
      { $match: { userId } },
      { $group: { _id: { year: { $year: "$date" }, month: { $month: "$date" } } } },
      { $project: { _id: 0, year: "$_id.year", month: "$_id.month" } },
    ]),
};
