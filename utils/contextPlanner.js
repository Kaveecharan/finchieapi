// ── Financial Context Planner ──────────────────────────────────────────────────
// Pure deterministic function — no I/O, no AI calls.
// Reads the user's question and returns the minimum data plan required to
// answer it correctly.  The plan drives contextBuilder.js which fires only
// the DB queries that are actually needed.

const isoDate = (d) => d.toISOString().split("T")[0];

// ── Date range helpers ─────────────────────────────────────────────────────────

const currentMonth = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start: isoDate(start), end: isoDate(end) };
};

const lastMonth = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  return { start: isoDate(start), end: isoDate(end) };
};

const currentYear = () => {
  const now = new Date();
  return { start: isoDate(new Date(now.getFullYear(), 0, 1)), end: isoDate(now) };
};

const lastYear = () => {
  const y = new Date().getFullYear() - 1;
  return { start: isoDate(new Date(y, 0, 1)), end: isoDate(new Date(y, 11, 31)) };
};

// ── Time range detection ───────────────────────────────────────────────────────

const extractRollingMonths = (q) => {
  const m = q.match(/(?:last|past|previous|over\s+the\s+last)\s+(\d+)\s+months?/i);
  if (m) return parseInt(m[1], 10);
  if (/\bhalf[\s-]?a[\s-]?year\b/i.test(q))           return 6;
  if (/\b(a\s+)?quarter\b/i.test(q))                   return 3;
  if (/\b3[\s-]months?\b/i.test(q))                    return 3;
  if (/\b6[\s-]months?\b/i.test(q))                    return 6;
  if (/\b12[\s-]months?\b/i.test(q))                   return 12;
  return null;
};

const detectTimeRange = (q) => {
  // Explicit all-time
  if (/\b(all[\s-]time|since\s+i\s+(started|joined|began)|lifetime|ever|from\s+the\s+beginning)\b/i.test(q)) {
    return { type: "all-time", start: null, end: null, rollingMonths: null };
  }

  // Explicit rolling window
  const rolling = extractRollingMonths(q);
  if (rolling) {
    return { type: "rolling", start: null, end: null, rollingMonths: rolling };
  }

  if (/\bthis\s+year\b|\bcurrent\s+year\b/i.test(q)) {
    const { start, end } = currentYear();
    return { type: "year", start, end, rollingMonths: null };
  }

  if (/\blast\s+year\b|\bprevious\s+year\b/i.test(q)) {
    const { start, end } = lastYear();
    return { type: "year", start, end, rollingMonths: null };
  }

  if (/\blast\s+month\b|\bprevious\s+month\b/i.test(q)) {
    const { start, end } = lastMonth();
    return { type: "month", start, end, rollingMonths: null };
  }

  // Default: current month
  const { start, end } = currentMonth();
  return { type: "month", start, end, rollingMonths: null };
};

// ── Intent detection ───────────────────────────────────────────────────────────

const detectIntent = (q) => {
  // Balance / available funds
  if (/\bbalance\b|\bhow\s+much\s+(do\s+i\s+have|have\s+i\s+got|is\s+left|is\s+available)\b|\bavailable\s+(funds|money|cash)\b/i.test(q)) {
    return "balance";
  }

  // Forecast / projection
  if (/\b(forecast|project|predict|where\s+will\s+i\s+be|if\s+i\s+continue|in\s+\d+\s+months?|going\s+forward)\b/i.test(q)) {
    return "forecast";
  }

  // Year-over-year or period comparison
  if (/\b(am\s+i\s+saving\s+more|saving\s+more\s+than|more\s+than\s+last\s+year|compare\s+(this|last)\s+year|vs\.?\s+(last|this)\s+year|year[\s-]over[\s-]year)\b/i.test(q)) {
    return "year_comparison";
  }

  // Worst / best month
  if (/\b(worst|best|highest|lowest)\b.*\bmonth\b|\bworst\s+financial\s+month\b|\bmy\s+worst\b|\bmy\s+best\b/i.test(q)) {
    return "worst_best_month";
  }

  // Weekday vs weekend
  if (/\b(weekday|weekend|week[\s-]?day|week[\s-]?end|day[\s-]?of[\s-]?week)\b/i.test(q)) {
    return "day_pattern";
  }

  // Category growth
  if (/\b(growing|fastest\s+growing|grew\s+fastest|growth|increased\s+most|which\s+categor|category.*grew|grew.*categor)\b/i.test(q)) {
    return "category_growth";
  }

  // Trend over time
  if (/\b(trend|over\s+time|month[\s-]by[\s-]month|each\s+month|monthly\s+trend|over\s+the\s+(months|year))\b/i.test(q)) {
    return "trend";
  }

  // Subscriptions
  if (/\b(subscri|recurring|paying\s+for|regular\s+payment|monthly\s+charges?|monthly\s+bills?)\b/i.test(q)) {
    return "subscriptions";
  }

  // Savings goals
  if (/\b(saving(s)?|goal(s)?|set\s+aside|put\s+aside|saved?\s+up|saving\s+rate)\b/i.test(q)) {
    return "savings";
  }

  // Income
  if (/\b(income|earn(ed|ing)?|salary|wages?|received|got\s+paid|brought\s+in|take[\s-]?home)\b/i.test(q)) {
    return "income";
  }

  // Category-specific spend
  if (/how\s+much\s+.*(on|for)\s+\w/i.test(q) ||
      /\b(food|groceri(es)?|transport(ation)?|dining|restaurant|shopping|rent|utilities|entertainment|health|gym|clothing|education|coffee|takeaway|fuel|travel)\b/i.test(q)) {
    return "category_spending";
  }

  // General monthly spend
  if (/how\s+much\s+(did\s+i\s+|have\s+i\s+)?spend\b|\btotal\s+(expenses?|spending)\b|\bmonthly\s+spend(ing)?\b/i.test(q)) {
    return "monthly_spending";
  }

  return "general_spending";
};

// ── Plan builder per intent ────────────────────────────────────────────────────

const buildPlan = (intent, timeRange, q) => {
  const CM = () => ({ ...currentMonth(), type: "month", rollingMonths: null });

  switch (intent) {

    case "balance":
      return {
        requiredData:       ["expenses", "income", "savings"],
        requiredBreakdowns: [],
        requiredMetrics:    ["total"],
        topN:               { categories: 0, merchants: 0 },
        analysisHints:      [],
        complexity:         "low",
        timeRange:          { type: "all-time", start: null, end: null, rollingMonths: null },
      };

    case "monthly_spending": {
      // If the time range resolved to all-time (no time indicator), default to current month
      const tr = timeRange.type === "all-time" ? CM() : timeRange;
      return {
        requiredData:       ["expenses"],
        requiredBreakdowns: ["category"],
        requiredMetrics:    ["total"],
        topN:               { categories: 5, merchants: 0 },
        analysisHints:      [],
        complexity:         "low",
        timeRange:          tr,
      };
    }

    case "category_spending":
      return {
        requiredData:       ["expenses"],
        requiredBreakdowns: ["category"],
        requiredMetrics:    ["total"],
        topN:               { categories: 10, merchants: 0 },
        analysisHints:      [],
        complexity:         "low",
        timeRange,
      };

    case "income":
      return {
        requiredData:       ["income"],
        requiredBreakdowns: [],
        requiredMetrics:    ["total"],
        topN:               { categories: 0, merchants: 0 },
        analysisHints:      [],
        complexity:         "low",
        timeRange,
      };

    case "savings":
      return {
        requiredData:       ["savings"],
        requiredBreakdowns: [],
        requiredMetrics:    ["total"],
        topN:               { categories: 0, merchants: 0 },
        analysisHints:      ["savingRate"],
        complexity:         "low",
        timeRange:          { type: "all-time", start: null, end: null, rollingMonths: null },
      };

    case "subscriptions":
      return {
        requiredData:       ["subscriptions"],
        requiredBreakdowns: [],
        requiredMetrics:    ["total"],
        topN:               { categories: 0, merchants: 0 },
        analysisHints:      [],
        complexity:         "low",
        timeRange:          CM(),
      };

    case "category_growth": {
      const n = timeRange.rollingMonths ?? 8;
      return {
        requiredData:       ["expenses"],
        requiredBreakdowns: ["category", "month"],
        requiredMetrics:    ["trend", "growth"],
        topN:               { categories: 8, merchants: 0 },
        analysisHints:      ["growthRate"],
        complexity:         "high",
        timeRange:          { type: "rolling", start: null, end: null, rollingMonths: n },
      };
    }

    case "trend": {
      const n = timeRange.rollingMonths ?? 6;
      return {
        requiredData:       ["expenses", "income"],
        requiredBreakdowns: ["month"],
        requiredMetrics:    ["trend", "average"],
        topN:               { categories: 0, merchants: 0 },
        analysisHints:      [],
        complexity:         "medium",
        timeRange:          { type: "rolling", start: null, end: null, rollingMonths: n },
      };
    }

    case "forecast":
      return {
        requiredData:       ["expenses", "income", "savings"],
        requiredBreakdowns: ["month"],
        requiredMetrics:    ["trend", "average", "forecast"],
        topN:               { categories: 0, merchants: 0 },
        analysisHints:      [],
        complexity:         "medium",
        // 3 months is enough for a stable average; balance fetched separately in builder
        timeRange:          { type: "rolling", start: null, end: null, rollingMonths: 3 },
      };

    case "day_pattern":
      return {
        requiredData:       ["expenses"],
        requiredBreakdowns: ["weekday", "weekend"],
        requiredMetrics:    ["comparison"],
        topN:               { categories: 0, merchants: 0 },
        analysisHints:      ["spendingPattern"],
        complexity:         "medium",
        timeRange:          { type: "all-time", start: null, end: null, rollingMonths: null },
      };

    case "year_comparison": {
      // 24 months of monthly history covers current + previous year fully
      return {
        requiredData:       ["expenses", "income"],
        requiredBreakdowns: ["month"],
        requiredMetrics:    ["comparison", "total"],
        topN:               { categories: 0, merchants: 0 },
        analysisHints:      ["savingRate"],
        complexity:         "medium",
        timeRange:          { type: "rolling", start: null, end: null, rollingMonths: 24 },
      };
    }

    case "worst_best_month": {
      const n = timeRange.rollingMonths ?? 12;
      const hint = /worst/i.test(q) ? "worstMonth" : "bestMonth";
      return {
        requiredData:       ["expenses", "income"],
        requiredBreakdowns: ["month"],
        requiredMetrics:    ["total", "comparison"],
        topN:               { categories: 0, merchants: 0 },
        analysisHints:      [hint],
        complexity:         "medium",
        timeRange:          { type: "rolling", start: null, end: null, rollingMonths: n },
      };
    }

    default: // general_spending
      return {
        requiredData:       ["expenses"],
        requiredBreakdowns: ["category"],
        requiredMetrics:    ["total"],
        topN:               { categories: 5, merchants: 0 },
        analysisHints:      [],
        complexity:         "low",
        timeRange,
      };
  }
};

// ── Public API ─────────────────────────────────────────────────────────────────

export const contextPlanner = {
  /**
   * Analyse a finance question and return the minimum data plan needed to
   * answer it correctly.
   *
   * @param {string} question - Raw user question text
   * @returns {object} DataPlan
   */
  plan: (question) => {
    const q      = question.trim();
    const intent    = detectIntent(q);
    const timeRange = detectTimeRange(q);
    const planData  = buildPlan(intent, timeRange, q);

    return {
      intent,
      timeRange:          planData.timeRange,
      requiredData:       planData.requiredData,
      requiredBreakdowns: planData.requiredBreakdowns,
      requiredMetrics:    planData.requiredMetrics,
      topN:               planData.topN,
      analysisHints:      planData.analysisHints,
      complexity:         planData.complexity,
    };
  },
};
