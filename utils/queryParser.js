// ── Finance Query Parser ───────────────────────────────────────────────────────
// Cheap AI call (max_tokens:250, temperature:0) that converts a natural-language
// finance question into a structured QuerySchema JSON.
// The schema drives metricEngine.js — no hardcoded intents, no regex patterns.
// Any finance question the user could ever ask is handled generically.

import axios   from "axios";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

// ── Parser system prompt ───────────────────────────────────────────────────────
// Carefully worded: must produce valid JSON every time, must cover all time period
// types, all intents, and all metric combinations.

// Built fresh each call so "today" / quarter / year calculations are always correct.
const buildParserPrompt = () => {
  const now     = new Date();
  const today   = now.toISOString().slice(0, 10);          // e.g. 2026-06-14
  const year    = now.getFullYear();                        // e.g. 2026
  const month   = now.getMonth() + 1;                      // 1-12
  const quarter = Math.ceil(month / 3);                    // 1-4
  return PARSER_SYSTEM_PROMPT_TEMPLATE
    .replace("{{TODAY}}",   today)
    .replace("{{YEAR}}",    String(year))
    .replace("{{MONTH}}",   String(month))
    .replace("{{QUARTER}}", String(quarter));
};

const PARSER_SYSTEM_PROMPT_TEMPLATE = `You are a finance query parser. Convert the user's natural-language finance question into structured JSON.

TODAY'S DATE: {{TODAY}}  |  Current year: {{YEAR}}  |  Current month: {{MONTH}}  |  Current quarter: Q{{QUARTER}}
Use these values when resolving relative time references like "this year", "Q1", "last January", "this quarter", etc.

Return ONLY valid JSON — no markdown, no explanation. Use this exact schema:
{
  "intent": "<intent>",
  "financialScope": "<scope>",
  "category": <category>,
  "period": { <period object> },
  "metricsNeeded": [ "<metric>", ... ]
}

INTENT values (pick the single best match):
  total_spend | total_income | total_savings | category_breakdown | highest_category |
  lowest_category | average_spend | transaction_count | trend | comparison | forecast |
  balance | subscription_detection | day_pattern | budget_analysis | biggest_transaction | general

SCOPE values: "expense" | "income" | "savings" | "all"

CATEGORY: null (all categories) | a lowercase category name (e.g. "food", "transport", "rent") | "all"

PERIOD types and their required fields:
  all_time       → {}
  today          → {}
  yesterday      → {}
  this_week      → {}
  last_week      → {}
  this_month     → {}
  last_month     → {}
  this_year      → {}
  last_year      → {}
  rolling_days   → { "days": <number> }
  rolling_months → { "months": <number> }
  specific_month → { "month": <1-12>, "year": <YYYY> }
  specific_year  → { "year": <YYYY> }
  quarter        → { "quarter": <1-4>, "year": <YYYY> }
  date_range     → { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }
  comparison     → { "comparison": { "period1": { <period object> }, "period2": { <period object> } } }

METRICS (include all that are needed to answer the question):
  totalExpenses | totalIncome | totalSavings | categoryBreakdown | highestCategory |
  lowestCategory | monthlyTrend | categoryTrend | transactionCount | averageMonthly |
  dayOfWeekPattern | subscriptions | savingsGoals | netBalance | availableBalance |
  biggestTransaction | comparison | forecast | incomeBreakdown

RULES:
- "all time" / "ever" / "since I started" / "lifetime" → all_time
- "last N days" / "past N days" → rolling_days with days:N
- "last N months" / "past N months" → rolling_months with months:N
- "past week" / "last 7 days" → rolling_days with days:7
- "past 90 days" / "last 3 months" → rolling_months with months:3
- "last 6 months" → rolling_months with months:6
- "last 12 months" / "past year" → rolling_months with months:12
- Named months (January, Feb, March...) in current year → specific_month with correct month number
- Named months with year (January 2024) → specific_month with month and year
- Q1/Q2/Q3/Q4 → quarter with quarter number and current or stated year
- Specific year (2024, 2025) → specific_year
- "between X and Y" / "from X to Y" → date_range
- Comparisons ("this month vs last month", "compare X and Y") → comparison type with both periods
- "balance" / "how much do I have" / "available money" → intent:balance, include availableBalance and netBalance
- "highest/most expensive category" → intent:highest_category, include categoryBreakdown and highestCategory
- "lowest/cheapest category" → intent:lowest_category, include categoryBreakdown and lowestCategory
- "how much spent on [category]" → intent:total_spend, set category, include totalExpenses and categoryBreakdown
- "trend" / "month by month" / "over time" → intent:trend, include monthlyTrend
- "forecast" / "predict" / "where will I be" → intent:forecast, include forecast and monthlyTrend
- "subscriptions" / "recurring" → intent:subscription_detection, include subscriptions
- "weekday" / "weekend" / "day of week" → intent:day_pattern, include dayOfWeekPattern
- "biggest expense" / "largest transaction" → intent:biggest_transaction, include biggestTransaction
- "average" → intent:average_spend, include averageMonthly and monthlyTrend
- "how many transactions" / "how many times" → intent:transaction_count, include transactionCount
- "savings goal" / "saving for" / "how much saved" → financialScope:savings, include savingsGoals and totalSavings
- "income" / "earned" / "salary" → financialScope:income, include totalIncome
- Always include the primary total (totalExpenses for expense, totalIncome for income, totalSavings for savings)
- For all_time queries, always include netBalance as well
- If you cannot determine the intent clearly, use intent:general and include categoryBreakdown and totalExpenses`;

// ── Fallback schema when AI parser fails ───────────────────────────────────────
// Defaults to current month total with category breakdown — the safest generic answer.

const fallbackSchema = () => ({
  intent:         "general",
  financialScope: "expense",
  category:       null,
  period:         { type: "this_month" },
  metricsNeeded:  ["totalExpenses", "categoryBreakdown"],
});

// ── Public API ─────────────────────────────────────────────────────────────────

export const queryParser = {
  parse: async (question) => {
    if (!env.OPENAI_API_KEY) return fallbackSchema();

    try {
      const { data } = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model:       "gpt-4o-mini",
          max_tokens:  300,
          temperature: 0,
          messages: [
            { role: "system", content: buildParserPrompt() },
            { role: "user",   content: question },
          ],
        },
        {
          headers: {
            Authorization:  `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 10_000,
        }
      );

      const raw = data.choices?.[0]?.message?.content?.trim();
      if (!raw) return fallbackSchema();

      // Strip markdown code fences if the model wrapped them
      const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const schema = JSON.parse(cleaned);

      // Ensure required fields exist
      if (!schema.intent)        schema.intent        = "general";
      if (!schema.financialScope) schema.financialScope = "expense";
      if (!schema.period)        schema.period        = { type: "this_month" };
      if (!Array.isArray(schema.metricsNeeded)) schema.metricsNeeded = ["totalExpenses"];

      logger.info({ event: "query_parsed", intent: schema.intent, period: schema.period?.type });
      return schema;

    } catch (err) {
      logger.warn({ event: "query_parser_failed", err: err.message });
      return fallbackSchema();
    }
  },
};
