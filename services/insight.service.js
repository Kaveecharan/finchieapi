import Budget from "../models/Budget.js";
import SavingGoal from "../models/SavingGoal.js";
import { expenseRepository } from "../repositories/expense.repository.js";
import { incomeRepository } from "../repositories/income.repository.js";
import { currentMonthRange } from "../utils/queryBuilder.js";
import { env } from "../config/env.js";

const CUR = env.CURRENCY_SYMBOL ?? "£";
const fmt = (n) => `${CUR}${Math.round(n).toLocaleString("en-US")}`;
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// Returns up to 3 insights for a premium user, sorted by urgency/date.
// Each insight: { title: string, body: string, sortKey: number }
// Runs all queries in parallel — no sequential waterfalls.
export const insightService = {
  computeForUser: async (userId) => {
    const insights = [];
    const { start: monthStart, end: monthEnd } = currentMonthRange();

    // Previous calendar month bounds (JS Date handles month-index wrap correctly)
    const prevStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
    const prevEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth(),
      0, 23, 59, 59, 999
    );

    const [
      expenseByCategory,
      budgets,
      activeGoals,
      currIncomeResult,
      prevIncomeResult,
    ] = await Promise.all([
      expenseRepository.aggregateByCategory(userId, monthStart, monthEnd),
      Budget.find({ userId }).lean(),
      SavingGoal.find({ userId, status: "active", deadline: { $gt: new Date() } })
        .sort({ deadline: 1 })
        .lean(),
      incomeRepository.sumByFilter({ userId, date: { $gte: monthStart, $lte: monthEnd } }),
      incomeRepository.sumByFilter({ userId, date: { $gte: prevStart, $lte: prevEnd } }),
    ]);

    // ── 1. Budget pressure (highest priority — actionable) ────────────────────
    // Matched by category ID for reliability; fallback-matched by name is NOT used
    // to avoid false positives from renamed categories.
    if (budgets.length > 0 && expenseByCategory.length > 0) {
      const spendById = {};
      for (const row of expenseByCategory) {
        if (row._id.id) spendById[row._id.id.toString()] = row.total;
      }

      let worstExceeded = null;
      let worstApproaching = null;

      for (const budget of budgets) {
        const spent = spendById[budget.categoryId?.toString()] ?? 0;
        const ratio = budget.amount > 0 ? spent / budget.amount : 0;

        if (ratio >= 1) {
          const over = spent - budget.amount;
          if (!worstExceeded || over > worstExceeded.over) {
            worstExceeded = { name: budget.categoryName, over };
          }
        } else if (ratio >= 0.9) {
          const remaining = budget.amount - spent;
          if (!worstApproaching || remaining < worstApproaching.remaining) {
            worstApproaching = { name: budget.categoryName, remaining };
          }
        }
      }

      if (worstExceeded) {
        insights.push({
          title: "Budget exceeded",
          body: `You are exceeding your ${worstExceeded.name} budget by ${fmt(worstExceeded.over)}`,
          sortKey: Date.now() + 100_000,
        });
      } else if (worstApproaching) {
        insights.push({
          title: "Budget alert",
          body: `You are reaching your ${worstApproaching.name} budget (${fmt(worstApproaching.remaining)} remaining)`,
          sortKey: Date.now() + 200_000,
        });
      }
    }

    // ── 2. Savings deadline (date-sorted — nearest deadline wins) ─────────────
    // Goals are pre-sorted by deadline ASC; push only the nearest valid one.
    for (const goal of activeGoals) {
      const remaining = goal.plannedAmount - goal.currentAmount;
      if (remaining <= 0) continue;

      insights.push({
        title: "Savings goal",
        body: `You have a savings goal needing ${fmt(remaining)} by ${fmtDate(goal.deadline)}`,
        sortKey: new Date(goal.deadline).getTime(), // absolute ms → nearest first
      });
      break;
    }

    // ── 3. Expense concentration ──────────────────────────────────────────────
    if (expenseByCategory.length > 0) {
      const top = expenseByCategory[0]; // already DESC by total
      insights.push({
        title: "Top spending category",
        body: `Most of your expenses are in ${top._id.name} (${fmt(top.total)})`,
        sortKey: Date.now() + 300_000,
      });
    }

    // ── 4. Income trend ───────────────────────────────────────────────────────
    const currIncome = currIncomeResult[0]?.total ?? 0;
    const prevIncome = prevIncomeResult[0]?.total ?? 0;

    if (currIncome > 0 && prevIncome > 0) {
      const diff = currIncome - prevIncome;
      if (diff !== 0) {
        const dir = diff > 0 ? "increased" : "decreased";
        insights.push({
          title: "Income update",
          body: `Your income has ${dir} by ${fmt(Math.abs(diff))} compared to last month`,
          sortKey: Date.now() + 400_000,
        });
      }
    }

    // Sort ascending: nearest relevant date / highest urgency first
    insights.sort((a, b) => a.sortKey - b.sortKey);

    return insights.slice(0, 3);
  },
};
