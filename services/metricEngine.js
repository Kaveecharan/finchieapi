// ── Metric Engine ──────────────────────────────────────────────────────────────
// Executes DB queries from a QuerySchema and returns pre-calculated results.
// Every metric is conditional — only what the schema requests is fetched.
// AI receives final numbers, never raw transaction lists.

import crypto     from "crypto";
import Expense    from "../models/Expense.js";
import Income     from "../models/Income.js";
import SavingGoal from "../models/SavingGoal.js";
import { expenseRepository } from "../repositories/expense.repository.js";
import { incomeRepository }  from "../repositories/income.repository.js";
import { resolvePeriod, resolveComparisonPeriods } from "../utils/periodResolver.js";

const round2 = (n) => Math.round(((n ?? 0) + Number.EPSILON) * 100) / 100;
const pct    = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");
const ACTIVE = { status: { $ne: "pending" } };

// ── Individual metric resolvers ────────────────────────────────────────────────

const M = {

  totalExpenses: async (userId, { startDate, endDate }) => {
    const r = await expenseRepository.sumByFilter({
      userId, date: { $gte: startDate, $lte: endDate },
    });
    return { total: round2(r[0]?.total ?? 0), count: r[0]?.count ?? 0 };
  },

  totalIncome: async (userId, { startDate, endDate }) => {
    const r = await incomeRepository.sumByFilter({
      userId, date: { $gte: startDate, $lte: endDate },
    });
    return { total: round2(r[0]?.total ?? 0), count: r[0]?.count ?? 0 };
  },

  totalSavings: async (userId) => {
    const goals  = await SavingGoal.find({ userId }).lean();
    const active = goals.filter((g) => g.status === "active");
    return {
      totalSaved:     round2(active.reduce((s, g) => s + (g.currentAmount ?? 0), 0)),
      activeGoals:    active.length,
      completedGoals: goals.filter((g) => g.status !== "active").length,
    };
  },

  // Expense category breakdown — always returns ALL user categories.
  // We never filter by category name at the DB level because the parser extracts
  // natural language ("food") which may not exactly match the user's custom category
  // name ("Food & Dining", "Groceries & Food", etc.). Returning the full list lets
  // the AI fuzzy-match the right category from pre-computed totals.
  categoryBreakdown: async (userId, { startDate, endDate }) => {
    const rows = await Expense.aggregate([
      { $match: { userId, ...ACTIVE, date: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: "$category.name", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);
    return rows.map((r) => ({ name: r._id, total: round2(r.total), count: r.count }));
  },

  incomeBreakdown: async (userId, { startDate, endDate }) => {
    const rows = await Income.aggregate([
      { $match: { userId, ...ACTIVE, date: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);
    return rows.map((r) => ({ type: r._id, total: round2(r.total), count: r.count }));
  },

  highestCategory: async (userId, period) => {
    const breakdown = await M.categoryBreakdown(userId, period);
    return breakdown[0] ?? null;
  },

  lowestCategory: async (userId, period) => {
    const breakdown = await M.categoryBreakdown(userId, period);
    if (breakdown.length === 0) return null;
    return breakdown[breakdown.length - 1];
  },

  // Monthly expense+income trend (bounded by startDate AND endDate)
  monthlyTrend: async (userId, { startDate, endDate }) => {
    const [expRows, incRows] = await Promise.all([
      Expense.aggregate([
        { $match: { userId, ...ACTIVE, date: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id:   { year: { $year: "$date" }, month: { $month: "$date" } },
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
      Income.aggregate([
        { $match: { userId, ...ACTIVE, date: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id:   { year: { $year: "$date" }, month: { $month: "$date" } },
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
    ]);

    const map = {};
    expRows.forEach(({ _id, total, count }) => {
      const k = `${_id.year}-${String(_id.month).padStart(2, "0")}`;
      if (!map[k]) map[k] = { month: k, expenses: 0, income: 0, expCount: 0, incCount: 0 };
      map[k].expenses = round2(total);
      map[k].expCount = count;
    });
    incRows.forEach(({ _id, total, count }) => {
      const k = `${_id.year}-${String(_id.month).padStart(2, "0")}`;
      if (!map[k]) map[k] = { month: k, expenses: 0, income: 0, expCount: 0, incCount: 0 };
      map[k].income   = round2(total);
      map[k].incCount = count;
    });

    return Object.values(map)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({
        ...m,
        net:         round2(m.income - m.expenses),
        savingsRate: pct(m.income - m.expenses, m.income),
      }));
  },

  // Per-category per-month trend (for growth analysis) — always all categories.
  categoryTrend: async (userId, { startDate, endDate }) => {
    const match = { userId, ...ACTIVE, date: { $gte: startDate, $lte: endDate } };
    const rows = await Expense.aggregate([
      { $match: match },
      {
        $group: {
          _id:   { cat: "$category.name", y: { $year: "$date" }, m: { $month: "$date" } },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.y": 1, "_id.m": 1 } },
    ]);

    const catMap = {};
    rows.forEach(({ _id, total, count }) => {
      const monthKey = `${_id.y}-${String(_id.m).padStart(2, "0")}`;
      if (!catMap[_id.cat]) catMap[_id.cat] = { category: _id.cat, months: [], totalAll: 0 };
      catMap[_id.cat].months.push({ month: monthKey, total: round2(total), count });
      catMap[_id.cat].totalAll += total;
    });

    return Object.values(catMap)
      .sort((a, b) => b.totalAll - a.totalAll)
      .map(({ totalAll, ...rest }) => rest);
  },

  transactionCount: async (userId, { startDate, endDate }, financialScope) => {
    const dateFilter = { date: { $gte: startDate, $lte: endDate } };
    const [expCount, incCount] = await Promise.all([
      financialScope !== "income"
        ? Expense.countDocuments({ userId, ...ACTIVE, ...dateFilter })
        : Promise.resolve(0),
      financialScope !== "expense"
        ? Income.countDocuments({ userId, ...ACTIVE, ...dateFilter })
        : Promise.resolve(0),
    ]);
    return {
      expenses: expCount,
      income:   incCount,
      total:    expCount + incCount,
    };
  },

  averageMonthly: async (userId, period) => {
    const trend = await M.monthlyTrend(userId, period);
    if (!trend.length) return { avgExpenses: 0, avgIncome: 0, avgNet: 0, monthsAnalyzed: 0 };
    const n = trend.length;
    return {
      avgExpenses:    round2(trend.reduce((s, m) => s + m.expenses, 0) / n),
      avgIncome:      round2(trend.reduce((s, m) => s + m.income,   0) / n),
      avgNet:         round2(trend.reduce((s, m) => s + m.net,      0) / n),
      monthsAnalyzed: n,
    };
  },

  dayOfWeekPattern: async (userId) => {
    const rows = await Expense.aggregate([
      { $match: { userId, ...ACTIVE } },
      {
        $group: {
          _id:   { $dayOfWeek: "$date" }, // 1=Sun … 7=Sat
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let wdTotal = 0, wdCount = 0, weTotal = 0, weCount = 0;
    const byDay = rows.map(({ _id, total, count }) => {
      const name      = DAY_NAMES[_id - 1] ?? `Day${_id}`;
      const isWeekend = _id === 1 || _id === 7;
      if (isWeekend) { weTotal += total; weCount += count; }
      else           { wdTotal += total; wdCount += count; }
      return { day: name, total: round2(total), count, avgPerTx: count > 0 ? round2(total / count) : 0 };
    });
    return {
      byDay,
      weekday: { total: round2(wdTotal), count: wdCount, avgPerTx: wdCount > 0 ? round2(wdTotal / wdCount) : 0 },
      weekend: { total: round2(weTotal), count: weCount, avgPerTx: weCount > 0 ? round2(weTotal / weCount) : 0 },
    };
  },

  subscriptions: async (userId, { startDate, endDate }) => {
    // Items appearing ≥2 times in the period are treated as recurring
    const rows = await Expense.aggregate([
      { $match: { userId, ...ACTIVE, date: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id:   "$itemName",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
          cat:   { $first: "$category.name" },
        },
      },
      { $match: { count: { $gte: 2 } } },
      { $sort: { total: -1 } },
    ]);
    return rows.map((r) => ({
      name:          r._id,
      category:      r.cat,
      monthlyAmount: round2(r.total / (r.count || 1)),
      occurrences:   r.count,
    }));
  },

  savingsGoals: async (userId) => {
    const goals     = await SavingGoal.find({ userId }, { title: 1, plannedAmount: 1, currentAmount: 1, status: 1, deadline: 1 }).lean();
    const active    = goals.filter((g) => g.status === "active");
    const completed = goals.filter((g) => g.status !== "active");
    return {
      active: active.map((g) => ({
        name:        g.title,
        target:      round2(g.plannedAmount),
        saved:       round2(g.currentAmount),
        remaining:   round2((g.plannedAmount ?? 0) - (g.currentAmount ?? 0)),
        progressPct: pct(g.currentAmount, g.plannedAmount),
        deadline:    g.deadline?.toISOString().slice(0, 10) ?? null,
      })),
      completed: completed.slice(0, 5).map((g) => ({
        name:   g.title,
        target: round2(g.plannedAmount),
        saved:  round2(g.currentAmount),
      })),
      totalSavedInGoals: round2(active.reduce((s, g) => s + (g.currentAmount ?? 0), 0)),
    };
  },

  netBalance: async (userId) => {
    const epoch = new Date("2000-01-01T00:00:00Z");
    const [exp, inc] = await Promise.all([
      expenseRepository.sumByFilter({ userId, date: { $gte: epoch } }),
      incomeRepository.sumByFilter({ userId, date: { $gte: epoch } }),
    ]);
    const totalIncome   = inc[0]?.total ?? 0;
    const totalExpenses = exp[0]?.total ?? 0;
    return {
      allTimeIncome:   round2(totalIncome),
      allTimeExpenses: round2(totalExpenses),
      net:             round2(totalIncome - totalExpenses),
    };
  },

  availableBalance: async (userId) => {
    const net   = await M.netBalance(userId);
    const goals = await SavingGoal.find({ userId, status: "active" }, { currentAmount: 1 }).lean();
    const locked = goals.reduce((s, g) => s + (g.currentAmount ?? 0), 0);
    return {
      ...net,
      lockedInGoals: round2(locked),
      available:     round2(net.net - locked),
    };
  },

  biggestTransaction: async (userId, { startDate, endDate }, financialScope) => {
    if (financialScope === "income") {
      const row = await Income.findOne(
        { userId, ...ACTIVE, date: { $gte: startDate, $lte: endDate } }
      ).sort({ amount: -1 }).select("type amount date category").lean();
      return row ? { name: row.type, amount: round2(row.amount), date: row.date?.toISOString().slice(0, 10) } : null;
    }
    const row = await Expense.findOne(
      { userId, ...ACTIVE, date: { $gte: startDate, $lte: endDate } }
    ).sort({ amount: -1 }).select("itemName amount date category").lean();
    return row ? { name: row.itemName, amount: round2(row.amount), date: row.date?.toISOString().slice(0, 10), category: row.category?.name } : null;
  },

  // Comparison: fetch both periods and compute difference + percentage change
  comparison: async (userId, schema) => {
    const { period1, period2 } = resolveComparisonPeriods(schema.period);
    const scope    = schema.financialScope ?? "expense";
    const category = schema.category;

    const fetchPeriod = async (period) => {
      const out = { label: period.label };
      if (scope !== "income") {
        const r = await M.totalExpenses(userId, period);
        out.expenses     = r.total;
        out.expenseCount = r.count;
        // Always return full category breakdown — AI picks the relevant category
        out.categoryBreakdown = await M.categoryBreakdown(userId, period);
      }
      if (scope !== "expense") {
        const r = await M.totalIncome(userId, period);
        out.income = r.total;
        out.incomeCount = r.count;
      }
      if (scope === "all" || scope === "savings") {
        const r = await M.totalSavings(userId);
        out.savings = r.totalSaved;
      }
      return out;
    };

    const [data1, data2] = await Promise.all([fetchPeriod(period1), fetchPeriod(period2)]);

    const diff = (v1 = 0, v2 = 0) => ({
      period1:          round2(v1),
      period2:          round2(v2),
      difference:       round2(v1 - v2),
      percentageChange: v2 > 0 ? ((v1 - v2) / v2 * 100).toFixed(1) + "%" : "N/A",
    });

    return {
      period1: data1,
      period2: data2,
      changes: {
        ...(data1.expenses !== undefined ? { expenses: diff(data1.expenses, data2.expenses) } : {}),
        ...(data1.income   !== undefined ? { income:   diff(data1.income,   data2.income)   } : {}),
        ...(data1.savings  !== undefined ? { savings:  diff(data1.savings,  data2.savings)  } : {}),
      },
    };
  },

  // Forecast: 3-month rolling average → forward projections
  forecast: async (userId) => {
    const start = new Date();
    start.setMonth(start.getMonth() - 3);
    start.setDate(1);
    const trend = await M.monthlyTrend(userId, { startDate: start, endDate: new Date() });
    const recent = trend.slice(-3);
    if (!recent.length) return null;
    const n      = recent.length;
    const avgExp = round2(recent.reduce((s, m) => s + m.expenses, 0) / n);
    const avgInc = round2(recent.reduce((s, m) => s + m.income,   0) / n);
    const avgNet = round2(avgInc - avgExp);
    return {
      basedOnMonths:      n,
      avgMonthlyExpenses: avgExp,
      avgMonthlyIncome:   avgInc,
      avgMonthlyNet:      avgNet,
      next3Months:  { expenses: round2(avgExp * 3),  income: round2(avgInc * 3),  net: round2(avgNet * 3)  },
      next6Months:  { expenses: round2(avgExp * 6),  income: round2(avgInc * 6),  net: round2(avgNet * 6)  },
      next12Months: { expenses: round2(avgExp * 12), income: round2(avgInc * 12), net: round2(avgNet * 12) },
    };
  },
};

// ── Main engine ────────────────────────────────────────────────────────────────

export const metricEngine = {
  resolve: async (userId, schema) => {
    const { metricsNeeded = [], financialScope = "expense", category, period: schemaPeriod, intent } = schema;

    const needed      = new Set(metricsNeeded);
    const isComparison = intent === "comparison" || schemaPeriod?.type === "comparison";
    const period      = isComparison ? null : resolvePeriod(schemaPeriod);

    // Always include the primary scope total so AI always has something concrete
    if (!isComparison) {
      if (financialScope === "expense" || financialScope === "all") needed.add("totalExpenses");
      if (financialScope === "income"  || financialScope === "all") needed.add("totalIncome");
      if (financialScope === "savings") needed.add("totalSavings");
    }

    // Build parallel task map
    const tasks = {};

    if (needed.has("totalExpenses")   && period)  tasks.totalExpenses   = M.totalExpenses(userId, period);
    if (needed.has("totalIncome")     && period)  tasks.totalIncome     = M.totalIncome(userId, period);
    if (needed.has("totalSavings"))               tasks.totalSavings    = M.totalSavings(userId);
    if (needed.has("categoryBreakdown") && period) tasks.categoryBreakdown = M.categoryBreakdown(userId, period);
    if (needed.has("incomeBreakdown") && period)  tasks.incomeBreakdown = M.incomeBreakdown(userId, period);
    if (needed.has("highestCategory") && period)  tasks.highestCategory = M.highestCategory(userId, period);
    if (needed.has("lowestCategory")  && period)  tasks.lowestCategory  = M.lowestCategory(userId, period);
    if (needed.has("monthlyTrend")    && period)  tasks.monthlyTrend    = M.monthlyTrend(userId, period);
    if (needed.has("categoryTrend")   && period)  tasks.categoryTrend   = M.categoryTrend(userId, period);
    if (needed.has("transactionCount") && period)  tasks.transactionCount = M.transactionCount(userId, period, financialScope);
    if (needed.has("averageMonthly")  && period)  tasks.averageMonthly  = M.averageMonthly(userId, period);
    if (needed.has("dayOfWeekPattern"))            tasks.dayOfWeekPattern = M.dayOfWeekPattern(userId);
    if (needed.has("subscriptions")   && period)  tasks.subscriptions   = M.subscriptions(userId, period);
    if (needed.has("savingsGoals"))               tasks.savingsGoals    = M.savingsGoals(userId);
    if (needed.has("netBalance"))                 tasks.netBalance      = M.netBalance(userId);
    if (needed.has("availableBalance"))           tasks.availableBalance = M.availableBalance(userId);
    if (needed.has("biggestTransaction") && period) tasks.biggestTransaction = M.biggestTransaction(userId, period, financialScope);
    if (needed.has("comparison"))                 tasks.comparison      = M.comparison(userId, schema);
    if (needed.has("forecast"))                   tasks.forecast        = M.forecast(userId);

    // Execute all needed queries in parallel
    const keys   = Object.keys(tasks);
    const values = await Promise.all(keys.map((k) => tasks[k]));
    const ctx    = { asOf: new Date().toLocaleString("en-GB", { month: "long", year: "numeric" }) };
    if (period) ctx.period = period.label;
    keys.forEach((k, i) => { ctx[k] = values[i]; });

    // Derived fields when both totals are present
    if (ctx.totalExpenses !== undefined && ctx.totalIncome !== undefined) {
      const exp = ctx.totalExpenses?.total ?? 0;
      const inc = ctx.totalIncome?.total   ?? 0;
      ctx.net         = round2(inc - exp);
      ctx.savingsRate = pct(inc - exp, inc);
    }

    return ctx;
  },
};

// ── Quick state fingerprint (for cache invalidation) ──────────────────────────
// 2 DB queries: all-time expense + income sums, rounded to £50.
// Used by chat.service.js to check the cache BEFORE building full context.

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
