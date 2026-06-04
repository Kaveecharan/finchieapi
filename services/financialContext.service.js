import crypto from "crypto";
import SavingGoal from "../models/SavingGoal.js";
import { analyticsService } from "./analytics.service.js";

// ── Compact financial summary ─────────────────────────────────────────────────
// Sent to OpenAI for every Type B (AI) chat message.
// Deliberately small (~200 tokens) — no raw transactions, no verbose text.
// Round all amounts to avoid excessive decimal noise.

const round = (n) => Math.round(n);
const pct   = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");

export const financialContextService = {
  // Build the compact summary object for a user.
  build: async (userId) => {
    const [dashboard, trend, goals] = await Promise.all([
      analyticsService.getDashboard(userId, null),
      analyticsService.getTrend(userId, 3),
      SavingGoal.find({ userId, status: "active" }, {
        name: 1, targetAmount: 1, currentAmount: 1, monthlyContribution: 1,
      }).lean(),
    ]);

    const { summary, charts } = dashboard;

    // 3-month averages give AI better context than a single month snapshot
    const avgIncome   = trend.length ? trend.reduce((s, m) => s + m.income,   0) / trend.length : summary.totalIncome;
    const avgExpenses = trend.length ? trend.reduce((s, m) => s + m.expenses, 0) / trend.length : summary.totalExpenses;

    // Trend direction vs previous month
    let trendNote = "stable";
    if (trend.length >= 2) {
      const prev = trend[trend.length - 2];
      const last = trend[trend.length - 1];
      const delta = last.expenses - prev.expenses;
      if (delta >  prev.expenses * 0.08) trendNote = "spending up vs last month";
      else if (delta < -prev.expenses * 0.08) trendNote = "spending down vs last month";
    }

    // Top 5 expense categories (names + amounts only)
    const topCategories = (charts.expenseByCategory ?? [])
      .slice(0, 5)
      .map((c) => ({ name: c.name, amount: round(c.total) }));

    // Recurring / subscription detection: items appearing in top transactions
    // We use the topItems chart — recurring items tend to be in the top list
    const subscriptions = (charts.topItems ?? [])
      .filter((item) => item.isRecurring || item.occurrences >= 2)
      .slice(0, 5)
      .map((item) => ({ name: item.name, amount: round(item.total / (item.occurrences || 1)) }));

    const activeGoals = goals.slice(0, 3).map((g) => ({
      name:    g.name,
      target:  round(g.targetAmount),
      saved:   round(g.currentAmount),
      monthly: round(g.monthlyContribution ?? 0),
    }));

    return {
      period:          new Date().toLocaleString("en-GB", { month: "long", year: "numeric" }),
      balance:         round(summary.availableBalance ?? summary.netBalance ?? 0),
      income:          round(summary.totalIncome),
      expenses:        round(summary.totalExpenses),
      net:             round(summary.totalIncome - summary.totalExpenses),
      savingsRate:     pct(summary.totalIncome - summary.totalExpenses, summary.totalIncome),
      avgIncome:       round(avgIncome),
      avgExpenses:     round(avgExpenses),
      topCategories,
      subscriptions,
      activeGoals,
      trend:           trendNote,
    };
  },

  // SHA-256 hash of the rounded financial snapshot.
  // Rounded to £50 so minor fluctuations don't bust the cache.
  hash: (ctx) => {
    const stable = {
      balance:  Math.round(ctx.balance  / 50) * 50,
      income:   Math.round(ctx.income   / 50) * 50,
      expenses: Math.round(ctx.expenses / 50) * 50,
      goals:    ctx.activeGoals.length,
    };
    return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 32);
  },
};
