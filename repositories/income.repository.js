import Income from "../models/Income.js";

const ACTIVE = { status: { $ne: "pending" } };

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

  aggregateByType: (userId, start, end) =>
    Income.aggregate([
      { $match: { userId, ...ACTIVE, date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
          whose: { $addToSet: "$whose" },
        },
      },
      { $sort: { total: -1 } },
    ]),

  aggregateByCategory: (userId, start, end) =>
    Income.aggregate([
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

  aggregateMonthlyTrend: (userId, start) =>
    Income.aggregate([
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

  sumByFilter: (filter) =>
    Income.aggregate([
      { $match: { ...filter, ...ACTIVE } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),

  aggregateMonths: (userId) =>
    Income.aggregate([
      { $match: { userId, ...ACTIVE } },
      { $group: { _id: { year: { $year: "$date" }, month: { $month: "$date" } } } },
      { $project: { _id: 0, year: "$_id.year", month: "$_id.month" } },
    ]),
};
