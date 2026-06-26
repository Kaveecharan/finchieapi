import { expenseRepository } from "../repositories/expense.repository.js";
import { incomeRepository } from "../repositories/income.repository.js";
import { savingGoalRepository } from "../repositories/savingGoal.repository.js";
import { currentMonthRange, monthToDateRange } from "../utils/queryBuilder.js";

export const analyticsService = {
  // Full dashboard payload: all three chart datasets + summary numbers
  getDashboard: async (userId, month) => {
    const { start, end } = month ? monthToDateRange(month) : currentMonthRange();

    const [
      expenseByCategory,
      topItems,
      incomeByType,
      expenseSumResult,
      incomeSumResult,
      totalSavings,
      allTimeExpenseResult,
      allTimeIncomeResult,
    ] = await Promise.all([
      expenseRepository.aggregateByCategory(userId, start, end),
      expenseRepository.aggregateTopItems(userId, start, end, 10),
      incomeRepository.aggregateByType(userId, start, end),
      expenseRepository.sumByFilter({ userId, date: { $gte: start, $lte: end } }),
      incomeRepository.sumByFilter({ userId, date: { $gte: start, $lte: end } }),
      savingGoalRepository.totalCurrentByUser(userId),
      // All-time totals for real-time balance — unaffected by the month filter
      expenseRepository.sumByFilter({ userId }),
      incomeRepository.sumByFilter({ userId }),
    ]);

    const totalExpenses = expenseSumResult[0]?.total ?? 0;
    const totalIncome   = incomeSumResult[0]?.total  ?? 0;
    const expenseCount  = expenseSumResult[0]?.count ?? 0;
    const incomeCount   = incomeSumResult[0]?.count  ?? 0;

    // netBalance      = month-scoped net (kept for backward compat)
    // availableBalance = all-time real balance: always accurate regardless of selected month
    const netBalance       = totalIncome - totalExpenses;
    const availableBalance = (allTimeIncomeResult[0]?.total ?? 0)
                           - (allTimeExpenseResult[0]?.total ?? 0)
                           - totalSavings;

    return {
      period: { start, end },
      summary: {
        totalExpenses,
        totalIncome,
        netBalance,
        availableBalance,
        expenseCount,
        incomeCount,
        totalSavings,
      },
      charts: {
        expenseByCategory: expenseByCategory.map((r) => ({
          id: r._id.id,
          name: r._id.name,
          total: r.total,
          count: r.count,
        })),
        topItems: topItems.map((r) => ({
          name: r._id,
          total: r.total,
          count: r.count,
          category: r.category,
        })),
        incomeByType: incomeByType.map((r) => ({
          type: r._id,
          total: r.total,
          count: r.count,
          sources: r.whose.filter(Boolean),
        })),
      },
    };
  },

  // Returns a sorted list of "YYYY-MM" strings that have at least one
  // expense or income, used by the frontend calendar picker to disable
  // months with no data.
  getActiveMonths: async (userId) => {
    const [expMonths, incMonths] = await Promise.all([
      expenseRepository.aggregateMonths(userId),
      incomeRepository.aggregateMonths(userId),
    ]);

    const monthSet = new Set();
    const toYM = ({ year, month }) =>
      `${year}-${String(month).padStart(2, "0")}`;

    expMonths.forEach((r) => monthSet.add(toYM(r)));
    incMonths.forEach((r) => monthSet.add(toYM(r)));

    return Array.from(monthSet).sort();
  },

  // Lightweight available-balance check used by expense and savings services.
  // Uses all-time totals so it matches the availableBalance shown in the dashboard.
  getAvailableBalance: async (userId) => {
    const [expenseSum, incomeSum, totalSavings] = await Promise.all([
      expenseRepository.sumByFilter({ userId }),
      incomeRepository.sumByFilter({ userId }),
      savingGoalRepository.totalCurrentByUser(userId),
    ]);
    return (incomeSum[0]?.total ?? 0) - (expenseSum[0]?.total ?? 0) - totalSavings;
  },

  // Monthly trend for last N months (expenses vs income)
  getTrend: async (userId, months = 6) => {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - (months - 1));
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const [expenseTrend, incomeTrend] = await Promise.all([
      expenseRepository.aggregateMonthlyTrend(userId, startDate),
      incomeRepository.aggregateMonthlyTrend(userId, startDate),
    ]);

    // Merge into unified monthly array
    const monthMap = {};

    expenseTrend.forEach(({ _id, total }) => {
      const key = `${_id.year}-${String(_id.month).padStart(2, "0")}`;
      if (!monthMap[key]) monthMap[key] = { month: key, expenses: 0, income: 0 };
      monthMap[key].expenses = total;
    });

    incomeTrend.forEach(({ _id, total }) => {
      const key = `${_id.year}-${String(_id.month).padStart(2, "0")}`;
      if (!monthMap[key]) monthMap[key] = { month: key, expenses: 0, income: 0 };
      monthMap[key].income = total;
    });

    return Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
  },
};
