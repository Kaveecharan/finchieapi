import crypto from "crypto";
import axios from "axios";
import { env } from "../config/env.js";
import AiInsightCache from "../models/AiInsightCache.js";
import { analyticsService } from "./analytics.service.js";
import { logger } from "../utils/logger.js";

const todayKey = () => new Date().toISOString().slice(0, 10);

const computeSnapshotHash = (summary, categories) => {
  const stable = {
    income:   Math.round(summary.totalIncome),
    expenses: Math.round(summary.totalExpenses),
    savings:  Math.round(summary.totalSavings),
    cats:     categories
      .map((c) => ({ id: String(c.id ?? c.name), t: Math.round(c.total) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 32);
};

const callAI = async ({ summary, trend, categories }) => {
  const savingsRate =
    summary.totalIncome > 0
      ? ((summary.totalSavings / summary.totalIncome) * 100).toFixed(1)
      : "0.0";

  const trendText = trend.length
    ? trend.map((t) => `  ${t.month}: Income ${Math.round(t.income)}, Expenses ${Math.round(t.expenses)}`).join("\n")
    : "  No multi-month trend data yet.";

  const catText = categories.length
    ? categories.slice(0, 5).map((c) => `  ${c.name}: ${Math.round(c.total)}`).join("\n")
    : "  No category breakdown available.";

  const prompt = `You are a concise personal finance assistant. Analyze the data and respond with ONLY a valid JSON object — no markdown, no explanation.

Current Month:
  Income: ${Math.round(summary.totalIncome)}
  Expenses: ${Math.round(summary.totalExpenses)}
  Available Balance: ${Math.round(summary.availableBalance)}
  Active Savings: ${Math.round(summary.totalSavings)}
  Savings Rate: ${savingsRate}%

Monthly Trend (last 6 months):
${trendText}

Top Expense Categories:
${catText}

JSON format (respond with ONLY this, no other text):
{
  "trendSummary": "1-2 sentences on the overall financial direction",
  "spendingInsights": ["one specific spending observation", "second if relevant"],
  "savingsInsights": ["one observation about savings behavior"],
  "riskWarning": "a short warning if something looks risky, or null if finances look healthy",
  "suggestion": "1-2 actionable sentences the user can act on this week"
}`;

  const { data } = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type":  "application/json",
      },
      timeout: 15_000,
    }
  );

  const raw = data.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI response contained no JSON");

  const parsed = JSON.parse(match[0]);
  return {
    trendSummary:     String(parsed.trendSummary    ?? ""),
    spendingInsights: Array.isArray(parsed.spendingInsights) ? parsed.spendingInsights.map(String) : [],
    savingsInsights:  Array.isArray(parsed.savingsInsights)  ? parsed.savingsInsights.map(String)  : [],
    riskWarning:      parsed.riskWarning ? String(parsed.riskWarning) : null,
    suggestion:       String(parsed.suggestion ?? ""),
  };
};

export const aiInsightService = {
  getInsights: async (userId, forceRefresh = false) => {
    if (!env.OPENAI_API_KEY) return null;

    const [dashboard, trend] = await Promise.all([
      analyticsService.getDashboard(userId, null),
      analyticsService.getTrend(userId, 6),
    ]);

    const { summary, charts } = dashboard;
    const snapshotHash = computeSnapshotHash(summary, charts.expenseByCategory);
    const dayKey = todayKey();

    // Layer 1: snapshot hash cache — identical data → skip AI entirely
    if (!forceRefresh) {
      const cached = await AiInsightCache.findOne({ userId, snapshotHash }).lean();
      if (cached) return cached.response;
    }

    // Layer 2: daily hard limit — max 1 AI call per user per calendar day
    const usedToday = await AiInsightCache.countDocuments({ userId, dayKey });
    if (usedToday >= 1) {
      const latest = await AiInsightCache.findOne({ userId }).sort({ generatedAt: -1 }).lean();
      return latest?.response ?? null;
    }

    // Layer 3: call AI and cache the result
    try {
      const response = await callAI({ summary, trend, categories: charts.expenseByCategory });

      await AiInsightCache.findOneAndUpdate(
        { userId, snapshotHash },
        { $set: { response, dayKey, generatedAt: new Date() } },
        { upsert: true }
      );

      return response;
    } catch (err) {
      logger.error({ event: "ai_insight_error", userId, err: err.message });
      // Don't fail the request — return latest cached entry if any
      const latest = await AiInsightCache.findOne({ userId }).sort({ generatedAt: -1 }).lean();
      return latest?.response ?? null;
    }
  },
};
