// ── Financial Context Builder ──────────────────────────────────────────────────
// Executes a DataPlan (from contextPlanner.js) and returns a minimal, structured
// context object containing only the data required to answer the user's question.
// Every query here is conditional — nothing is fetched unless the plan requires it.

import crypto from "crypto";
import Expense from "../models/Expense.js";
import SavingGoal from "../models/SavingGoal.js";
import { expenseRepository } from "../repositories/expense.repository.js";
import { incomeRepository } from "../repositories/income.repository.js";

const round = (n) => Math.round(n ?? 0);
const pct   = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");
const ACTIVE = { status: { $ne: "pending" } };

// ── Date range resolution ──────────────────────────────────────────────────────

const resolveRange = (timeRange) => {
  const now = new Date();

  if (timeRange.type === "all-time") {
    return { start: new Date("2000-01-01"), end: now };
  }

  if (timeRange.type === "rolling") {
    const n = timeRange.rollingMonths ?? 3;
    const start = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }

  if (timeRange.start && timeRange.end) {
    return {
      start: new Date(timeRange.start),
      end:   new Date(`${timeRange.end}T23:59:59`),
    };
  }

  // Fallback: current month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
};

// ── Monthly merge helper ───────────────────────────────────────────────────────

const mergeMonthlies = (expArr, incArr) => {
  const map = {};
  (expArr ?? []).forEach(({ _id, total }) => {
    const k = `${_id.year}-${String(_id.month).padStart(2, "0")}`;
    if (!map[k]) map[k] = { month: k, expenses: 0, income: 0 };
    map[k].expenses = round(total);
  });
  (incArr ?? []).forEach(({ _id, total }) => {
    const k = `${_id.year}-${String(_id.month).padStart(2, "0")}`;
    if (!map[k]) map[k] = { month: k, expenses: 0, income: 0 };
    map[k].income = round(total);
  });
  return Object.values(map)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({ ...m, net: m.income - m.expenses }));
};

// ── Main builder ───────────────────────────────────────────────────────────────

export const contextBuilder = {
  build: async (userId, plan) => {
    const {
      requiredData, requiredBreakdowns, requiredMetrics,
      topN, intent,
    } = plan;
    const { start, end } = resolveRange(plan.timeRange);

    // What data groups are needed?
    const wantExp  = requiredData.includes("expenses");
    const wantInc  = requiredData.includes("income");
    const wantSav  = requiredData.includes("savings");
    const wantSubs = requiredData.includes("subscriptions");

    // What breakdowns are needed?
    const wantCat    = requiredBreakdowns.includes("category");
    const wantMonth  = requiredBreakdowns.includes("month");
    const wantDOW    = requiredBreakdowns.includes("weekday") || requiredBreakdowns.includes("weekend");
    // Category growth: need per-category per-month (replaces both flat category + flat month)
    const wantCatMth = wantCat && wantMonth;
    const wantFcst   = requiredMetrics.includes("forecast");

    // Balance / forecast always need all-time totals for the balance figure
    const needAllTime = intent === "balance" || intent === "forecast";
    const allTimeStart = new Date("2000-01-01");

    // ── Fire all needed queries in parallel ───────────────────────────────────
    const [
      expSum,
      incSum,
      expCats,          // flat category breakdown (period-scoped)
      expMthly,         // monthly expense trend
      incMthly,         // monthly income trend
      catMthlyRaw,      // per-category per-month (category growth only)
      dowRaw,           // day-of-week breakdown
      savGoals,         // savings goals
      topItemsRaw,      // for subscription detection
      allTimeExpSum,    // all-time totals (balance/forecast only)
      allTimeIncSum,
    ] = await Promise.all([
      wantExp
        ? expenseRepository.sumByFilter({ userId, date: { $gte: start, $lte: end } })
        : null,

      wantInc
        ? incomeRepository.sumByFilter({ userId, date: { $gte: start, $lte: end } })
        : null,

      // Flat category list — only when NOT doing per-category per-month
      wantExp && wantCat && !wantCatMth
        ? expenseRepository.aggregateByCategory(userId, start, end)
        : null,

      wantExp && wantMonth
        ? expenseRepository.aggregateMonthlyTrend(userId, start)
        : null,

      wantInc && wantMonth
        ? incomeRepository.aggregateMonthlyTrend(userId, start)
        : null,

      // Per-category per-month (category growth analysis)
      wantCatMth
        ? Expense.aggregate([
            { $match: { userId, ...ACTIVE, date: { $gte: start, $lte: end } } },
            {
              $group: {
                _id: {
                  cat: "$category.name",
                  y:   { $year:  "$date" },
                  m:   { $month: "$date" },
                },
                total: { $sum: "$amount" },
              },
            },
            { $sort: { "_id.y": 1, "_id.m": 1 } },
          ])
        : null,

      // Day-of-week — always all-time (historical pattern, not period-scoped)
      wantDOW
        ? Expense.aggregate([
            { $match: { userId, ...ACTIVE } },
            {
              $group: {
                _id:   { $dayOfWeek: "$date" },
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ])
        : null,

      wantSav || needAllTime
        ? SavingGoal.find(
            { userId },
            { title: 1, plannedAmount: 1, currentAmount: 1, status: 1, deadline: 1 }
          ).lean()
        : null,

      wantSubs
        ? expenseRepository.aggregateTopItems(userId, start, end, 20)
        : null,

      // All-time sums for available-balance calculation
      needAllTime
        ? expenseRepository.sumByFilter({ userId, date: { $gte: allTimeStart } })
        : null,

      needAllTime
        ? incomeRepository.sumByFilter({ userId, date: { $gte: allTimeStart } })
        : null,
    ]);

    // ── Assemble context ──────────────────────────────────────────────────────
    const ctx = {
      asOf: new Date().toLocaleString("en-GB", { month: "long", year: "numeric" }),
      timeRange: plan.timeRange.type === "rolling"
        ? `Last ${plan.timeRange.rollingMonths} months`
        : plan.timeRange.type === "all-time"
        ? "All time"
        : `${plan.timeRange.start} to ${plan.timeRange.end}`,
    };

    // Period totals
    if (expSum !== null) {
      ctx.totalExpenses = round(expSum[0]?.total  ?? 0);
      ctx.expenseCount  = expSum[0]?.count ?? 0;
    }
    if (incSum !== null) {
      ctx.totalIncome = round(incSum[0]?.total ?? 0);
    }
    if (expSum !== null && incSum !== null) {
      ctx.net         = round((incSum[0]?.total ?? 0) - (expSum[0]?.total ?? 0));
      ctx.savingsRate = pct(
        (incSum[0]?.total ?? 0) - (expSum[0]?.total ?? 0),
        incSum[0]?.total ?? 0
      );
    }

    // Available balance (all-time net minus savings held in goals)
    if (allTimeExpSum !== null && allTimeIncSum !== null) {
      const totalSaved = (savGoals ?? [])
        .filter((g) => g.status === "active")
        .reduce((s, g) => s + (g.currentAmount ?? 0), 0);
      ctx.availableBalance = round(
        (allTimeIncSum[0]?.total ?? 0) - (allTimeExpSum[0]?.total ?? 0) - totalSaved
      );
    }

    // Flat category breakdown
    if (expCats !== null) {
      const limit = (topN?.categories ?? 0) > 0 ? topN.categories : expCats.length;
      ctx.expensesByCategory = expCats.slice(0, limit).map((c) => ({
        name:  c._id?.name ?? c._id,
        total: round(c.total),
        count: c.count,
      }));
    }

    // Merged monthly history (expenses + income per month)
    if (expMthly !== null || incMthly !== null) {
      ctx.monthlyHistory = mergeMonthlies(expMthly, incMthly);
    }

    // Per-category per-month trend (category growth)
    if (catMthlyRaw !== null) {
      // Build month labels for the rolling window
      const n      = plan.timeRange.rollingMonths ?? 8;
      const labels = [];
      for (let i = 0; i < n; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() - (n - 1 - i));
        labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }

      // Build map: category → { "2025-11": 450, ... }
      const catMap    = {};
      const catTotals = {};
      catMthlyRaw.forEach(({ _id, total }) => {
        const key = `${_id.y}-${String(_id.m).padStart(2, "0")}`;
        if (!catMap[_id.cat]) { catMap[_id.cat] = {}; catTotals[_id.cat] = 0; }
        catMap[_id.cat][key]  = round(total);
        catTotals[_id.cat]   += total;
      });

      const limit = (topN?.categories ?? 0) > 0 ? topN.categories : Object.keys(catMap).length;
      const sorted = Object.keys(catTotals)
        .sort((a, b) => catTotals[b] - catTotals[a])
        .slice(0, limit);

      ctx.categoryTrends = sorted.map((cat) => ({
        category: cat,
        monthly:  labels.map((m) => ({ month: m, amount: catMap[cat]?.[m] ?? 0 })),
      }));
    }

    // Day-of-week breakdown (1=Sun … 7=Sat in MongoDB)
    if (dowRaw !== null) {
      let wdTotal = 0, wdCount = 0, weTotal = 0, weCount = 0;
      dowRaw.forEach(({ _id: dow, total, count }) => {
        if (dow === 1 || dow === 7) { weTotal += total; weCount += count; }
        else                         { wdTotal += total; wdCount += count; }
      });
      ctx.dayOfWeekSpending = {
        weekday: {
          total:             round(wdTotal),
          transactions:      wdCount,
          avgPerTransaction: wdCount > 0 ? round(wdTotal / wdCount) : 0,
        },
        weekend: {
          total:             round(weTotal),
          transactions:      weCount,
          avgPerTransaction: weCount > 0 ? round(weTotal / weCount) : 0,
        },
      };
    }

    // Savings goals
    if (savGoals !== null) {
      const active    = savGoals.filter((g) => g.status === "active");
      const completed = savGoals.filter((g) => g.status !== "active").slice(0, 3);
      ctx.savings = {
        active: active.map((g) => ({
          name:        g.title,
          target:      round(g.plannedAmount),
          saved:       round(g.currentAmount),
          progressPct: pct(g.currentAmount, g.plannedAmount),
          deadline:    g.deadline?.toISOString().slice(0, 7) ?? null,
        })),
        completed: completed.map((g) => ({
          name:   g.title,
          target: round(g.plannedAmount),
          saved:  round(g.currentAmount),
        })),
        totalSaved: round(active.reduce((s, g) => s + (g.currentAmount ?? 0), 0)),
      };
    }

    // Subscriptions — items appearing ≥2 times in the period
    if (topItemsRaw !== null) {
      ctx.subscriptions = topItemsRaw
        .filter((i) => i.count >= 2)
        .slice(0, 5)
        .map((i) => ({ name: i.name, amount: round(i.total / (i.count || 1)) }));
    }

    // 6-month forecast from 3-month rolling averages
    if (wantFcst && ctx.monthlyHistory?.length) {
      const recent = ctx.monthlyHistory.slice(-3);
      const avgExp = round(recent.reduce((s, m) => s + m.expenses, 0) / recent.length);
      const avgInc = round(recent.reduce((s, m) => s + m.income,   0) / recent.length);
      ctx.forecast = {
        avgMonthlyExpenses: avgExp,
        avgMonthlyIncome:   avgInc,
        avgMonthlyNet:      avgInc - avgExp,
        projectedIn6Months: {
          additionalExpenses: avgExp * 6,
          additionalIncome:   avgInc * 6,
          netChange:          (avgInc - avgExp) * 6,
        },
      };
    }

    return ctx;
  },
};

// ── Quick state fingerprint ────────────────────────────────────────────────────
// 2 DB queries only. Used by chat.service.js to check the cache BEFORE building
// the full context — avoids unnecessary DB work on a cache hit.

export const quickStateHash = async (userId) => {
  const [exp, inc] = await Promise.all([
    expenseRepository.sumByFilter({ userId }),
    incomeRepository.sumByFilter({ userId }),
  ]);
  const key = {
    e: Math.round((exp[0]?.total ?? 0) / 50) * 50,
    i: Math.round((inc[0]?.total ?? 0) / 50) * 50,
  };
  return crypto.createHash("sha256").update(JSON.stringify(key)).digest("hex").slice(0, 16);
};
