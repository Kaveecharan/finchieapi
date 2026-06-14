import crypto from "crypto";
import Expense from "../models/Expense.js";
import Income from "../models/Income.js";
import SavingGoal from "../models/SavingGoal.js";
import { analyticsService } from "./analytics.service.js";
import { expenseRepository } from "../repositories/expense.repository.js";
import { incomeRepository } from "../repositories/income.repository.js";

const round = (n) => Math.round(n ?? 0);
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");
const ACTIVE = { status: { $ne: "pending" } };

const HISTORY_MONTHS = 12;
const CATEGORY_TREND_MONTHS = 6;
const TOP_CAT_COUNT = 5;

export const financialContextService = {
  build: async (userId) => {
    const now = new Date();
    const currentYear = now.getFullYear();

    const startOfYear     = new Date(currentYear, 0, 1);
    const startOfLastYear = new Date(currentYear - 1, 0, 1);
    const endOfLastYear   = new Date(currentYear, 0, 0, 23, 59, 59);

    const catTrendStart = new Date(now);
    catTrendStart.setMonth(catTrendStart.getMonth() - (CATEGORY_TREND_MONTHS - 1));
    catTrendStart.setDate(1);
    catTrendStart.setHours(0, 0, 0, 0);

    const [
      dashboard,
      trend12,
      allTimeExpResult,
      allTimeIncResult,
      allTimeCats,
      catMonthlyRaw,
      dowRaw,
      tyExpResult,
      tyIncResult,
      lyExpResult,
      lyIncResult,
      goals,
      firstTx,
    ] = await Promise.all([
      // Current-month dashboard (charts + summary)
      analyticsService.getDashboard(userId, null),

      // 12-month income/expense trend
      analyticsService.getTrend(userId, HISTORY_MONTHS),

      // All-time totals
      expenseRepository.sumByFilter({ userId }),
      incomeRepository.sumByFilter({ userId }),

      // All-time top-10 expense categories
      Expense.aggregate([
        { $match: { userId, ...ACTIVE } },
        {
          $group: {
            _id: "$category.name",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),

      // Per-category per-month for the last CATEGORY_TREND_MONTHS months
      Expense.aggregate([
        { $match: { userId, ...ACTIVE, date: { $gte: catTrendStart } } },
        {
          $group: {
            _id: {
              cat: "$category.name",
              y:   { $year: "$date" },
              m:   { $month: "$date" },
            },
            total: { $sum: "$amount" },
          },
        },
        { $sort: { "_id.y": 1, "_id.m": 1 } },
      ]),

      // Day-of-week breakdown (MongoDB: 1=Sun … 7=Sat)
      Expense.aggregate([
        { $match: { userId, ...ACTIVE } },
        {
          $group: {
            _id:   { $dayOfWeek: "$date" },
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Year-to-date totals
      expenseRepository.sumByFilter({ userId, date: { $gte: startOfYear } }),
      incomeRepository.sumByFilter({ userId, date: { $gte: startOfYear } }),

      // Last full year totals
      expenseRepository.sumByFilter({ userId, date: { $gte: startOfLastYear, $lte: endOfLastYear } }),
      incomeRepository.sumByFilter({ userId, date: { $gte: startOfLastYear, $lte: endOfLastYear } }),

      // All savings goals
      SavingGoal.find(
        { userId },
        { title: 1, plannedAmount: 1, currentAmount: 1, status: 1, deadline: 1 }
      ).lean(),

      // Earliest active expense (account start date)
      Expense.findOne({ userId, ...ACTIVE }, { date: 1 }).sort({ date: 1 }).lean(),
    ]);

    const { summary, charts } = dashboard;
    const totalAllTimeExp = allTimeExpResult[0]?.total ?? 0;
    const totalAllTimeInc = allTimeIncResult[0]?.total ?? 0;

    // ── Account age ────────────────────────────────────────────────────────────
    const since = firstTx?.date ?? now;
    const monthsOfHistory = Math.max(
      1,
      (now.getFullYear() - since.getFullYear()) * 12 +
        (now.getMonth() - since.getMonth()) + 1
    );
    const accountSince = since.toLocaleString("en-GB", { month: "long", year: "numeric" });

    // ── 12-month income/expense history ───────────────────────────────────────
    const monthlyHistory = trend12.map((m) => ({
      month:    m.month,
      income:   round(m.income),
      expenses: round(m.expenses),
      net:      round(m.income - m.expenses),
    }));

    // ── All-time category breakdown ───────────────────────────────────────────
    const categoryAllTime = allTimeCats.map((c) => ({
      name:        c._id,
      total:       round(c.total),
      avgPerMonth: round(c.total / monthsOfHistory),
    }));

    // ── Category monthly trend for top categories ─────────────────────────────
    const topCatNames = allTimeCats.slice(0, TOP_CAT_COUNT).map((c) => c._id);

    const trendLabels = [];
    for (let i = 0; i < CATEGORY_TREND_MONTHS; i++) {
      const d = new Date(catTrendStart);
      d.setMonth(d.getMonth() + i);
      trendLabels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const catMap = {};
    catMonthlyRaw.forEach(({ _id, total }) => {
      const key = `${_id.y}-${String(_id.m).padStart(2, "0")}`;
      if (!catMap[_id.cat]) catMap[_id.cat] = {};
      catMap[_id.cat][key] = round(total);
    });

    const categoryTrends = topCatNames
      .filter((n) => catMap[n])
      .map((n) => ({
        category:   n,
        lastMonths: trendLabels.map((m) => ({ month: m, amount: catMap[n]?.[m] ?? 0 })),
      }));

    // ── Weekday vs weekend spending ───────────────────────────────────────────
    let wdTotal = 0, wdCount = 0, weTotal = 0, weCount = 0;
    dowRaw.forEach(({ _id: dow, total, count }) => {
      if (dow === 1 || dow === 7) { weTotal += total; weCount += count; }
      else                         { wdTotal += total; wdCount += count; }
    });
    const dayOfWeekSpending = {
      weekday: {
        total:              round(wdTotal),
        transactions:       wdCount,
        avgPerTransaction:  wdCount > 0 ? round(wdTotal / wdCount) : 0,
      },
      weekend: {
        total:              round(weTotal),
        transactions:       weCount,
        avgPerTransaction:  weCount > 0 ? round(weTotal / weCount) : 0,
      },
    };

    // ── Year-over-year comparison ─────────────────────────────────────────────
    const yearComparison = {
      [currentYear]: {
        expenses: round(tyExpResult[0]?.total ?? 0),
        income:   round(tyIncResult[0]?.total ?? 0),
        net:      round((tyIncResult[0]?.total ?? 0) - (tyExpResult[0]?.total ?? 0)),
      },
      [currentYear - 1]: {
        expenses: round(lyExpResult[0]?.total ?? 0),
        income:   round(lyIncResult[0]?.total ?? 0),
        net:      round((lyIncResult[0]?.total ?? 0) - (lyExpResult[0]?.total ?? 0)),
      },
    };

    // ── Savings goals ─────────────────────────────────────────────────────────
    const activeGoals    = goals.filter((g) => g.status === "active");
    const completedGoals = goals.filter((g) => g.status !== "active").slice(0, 3);
    const savings = {
      active: activeGoals.map((g) => ({
        name:        g.title,
        target:      round(g.plannedAmount),
        saved:       round(g.currentAmount),
        progressPct: pct(g.currentAmount, g.plannedAmount),
        deadline:    g.deadline ? g.deadline.toISOString().slice(0, 7) : null,
      })),
      completed: completedGoals.map((g) => ({
        name:   g.title,
        target: round(g.plannedAmount),
        saved:  round(g.currentAmount),
      })),
      totalSaved: round(activeGoals.reduce((s, g) => s + (g.currentAmount ?? 0), 0)),
    };

    // ── Recurring / subscription detection ───────────────────────────────────
    // Items appearing ≥2 times in the current month are treated as recurring.
    const subscriptions = (charts.topItems ?? [])
      .filter((item) => item.count >= 2)
      .slice(0, 5)
      .map((item) => ({
        name:   item.name,
        amount: round(item.total / (item.count || 1)),
      }));

    // ── 6-month projection based on 3-month average ───────────────────────────
    const recent3      = trend12.slice(-3);
    const avgMonthlyExp = recent3.length
      ? round(recent3.reduce((s, m) => s + m.expenses, 0) / recent3.length)
      : round(summary.totalExpenses);
    const avgMonthlyInc = recent3.length
      ? round(recent3.reduce((s, m) => s + m.income, 0) / recent3.length)
      : round(summary.totalIncome);

    const forecast = {
      avgMonthlyExpenses: avgMonthlyExp,
      avgMonthlyIncome:   avgMonthlyInc,
      avgMonthlyNet:      avgMonthlyInc - avgMonthlyExp,
      projectedIn6Months: {
        additionalExpenses: avgMonthlyExp * 6,
        additionalIncome:   avgMonthlyInc * 6,
        netChange:          (avgMonthlyInc - avgMonthlyExp) * 6,
      },
    };

    return {
      asOf:            now.toLocaleString("en-GB", { month: "long", year: "numeric" }),
      accountSince,
      monthsOfHistory,
      balance:         round(summary.availableBalance ?? summary.netBalance ?? 0),

      allTime: {
        totalIncome:   round(totalAllTimeInc),
        totalExpenses: round(totalAllTimeExp),
        net:           round(totalAllTimeInc - totalAllTimeExp),
      },

      currentMonth: {
        income:    round(summary.totalIncome),
        expenses:  round(summary.totalExpenses),
        net:       round(summary.totalIncome - summary.totalExpenses),
        savingsRate: pct(
          summary.totalIncome - summary.totalExpenses,
          summary.totalIncome
        ),
        topCategories: (charts.expenseByCategory ?? []).slice(0, 5).map((c) => ({
          name:   c.name,
          amount: round(c.total),
        })),
        incomeBreakdown: (charts.incomeByType ?? []).slice(0, 3).map((s) => ({
          type:   s.type ?? s.category ?? "Other",
          amount: round(s.total),
        })),
      },

      monthlyHistory,
      categoryAllTime,
      categoryTrends,
      dayOfWeekSpending,
      yearComparison,
      savings,
      subscriptions,
      forecast,
    };
  },

  // Stable hash for cache invalidation — rounded to £100 so minor fluctuations
  // don't bust the cache unnecessarily.
  hash: (ctx) => {
    const stable = {
      allTimeExp: Math.round((ctx.allTime?.totalExpenses ?? 0) / 100) * 100,
      allTimeInc: Math.round((ctx.allTime?.totalIncome   ?? 0) / 100) * 100,
      balance:    Math.round((ctx.balance ?? 0) / 100) * 100,
      goals:      ctx.savings?.active?.length ?? 0,
      months:     ctx.monthsOfHistory ?? 0,
    };
    return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 32);
  },
};
