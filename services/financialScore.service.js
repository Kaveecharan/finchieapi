import crypto from "crypto";
import axios from "axios";
import User from "../models/User.js";
import SavingGoal from "../models/SavingGoal.js";
import FinancialScore from "../models/FinancialScore.js";
import Subscription, { isPremiumActive } from "../models/Subscription.js";
import { expenseRepository } from "../repositories/expense.repository.js";
import { incomeRepository } from "../repositories/income.repository.js";
import { analyticsService } from "./analytics.service.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

// Free tier: 0 AI calls (AI is premium-only).
// Premium tier: generous limit — prevents runaway costs while allowing real use.
const PREMIUM_MONTHLY_AI_LIMIT = 10;
const REFRESH_DAYS     = 14;
const MIN_INCOME_ENTRIES  = 3;
const MIN_EXPENSE_ENTRIES = 3;
const MIN_ACCOUNT_AGE_DAYS = 14;

// ── Status label from raw score ───────────────────────────────────────────────

const statusFromScore = (score) => {
  if (score >= 450) return "Excellent";
  if (score >= 380) return "Strong";
  if (score >= 280) return "Stable";
  if (score >= 180) return "Improving";
  return "Needs Attention";
};

// ── Snapshot hash — rounds amounts to nearest $50 to ignore noise ─────────────

const computeSnapshotHash = ({ avgMonthlyIncome, avgMonthlyExpenses, totalIncomeCount, totalExpenseCount, activeSavingsGoals, monthsOfData }) => {
  const stable = {
    inc:  Math.round(avgMonthlyIncome  / 50),
    exp:  Math.round(avgMonthlyExpenses / 50),
    ic:   totalIncomeCount,
    ec:   totalExpenseCount,
    sg:   activeSavingsGoals,
    mo:   monthsOfData,
  };
  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 32);
};

// ── Raw metrics computation (pure math, no AI) ────────────────────────────────

const computeMetrics = ({ trend, avgMonthlyIncome, avgMonthlyExpenses, activeSavingsGoals, goalsWithDeposits, totalSavingsAmount, monthsOfData }) => {

  // 1. Savings Consistency (0–120)
  let savingsScore = 0;
  const savingsRate = avgMonthlyIncome > 0 ? totalSavingsAmount / avgMonthlyIncome : 0;
  if (activeSavingsGoals > 0)   savingsScore += 25;
  if (goalsWithDeposits > 0)    savingsScore += 35;
  if (activeSavingsGoals > 1)   savingsScore += 15;
  if      (savingsRate >= 0.15) savingsScore += 45;
  else if (savingsRate >= 0.10) savingsScore += 35;
  else if (savingsRate >= 0.05) savingsScore += 20;
  else if (savingsRate >  0)    savingsScore += 10;
  savingsScore = Math.min(savingsScore, 120);

  // 2. Income Stability (0–80)
  let incomeScore = 0;
  if      (monthsOfData >= 3) incomeScore += 20;
  else if (monthsOfData >= 2) incomeScore += 10;

  const monthsWithIncome = trend.filter((m) => m.income > 0).length;
  if (monthsWithIncome >= monthsOfData && monthsOfData >= 3) incomeScore += 20;
  else if (monthsWithIncome >= 2) incomeScore += 10;

  // Coefficient of variation — low CV = stable income
  const incomeValues = trend.map((m) => m.income);
  const incomeVariance = incomeValues.length > 1
    ? incomeValues.reduce((sum, v) => sum + (v - avgMonthlyIncome) ** 2, 0) / incomeValues.length
    : 0;
  const incomeCV = avgMonthlyIncome > 0 ? Math.sqrt(incomeVariance) / avgMonthlyIncome : 1;
  if      (incomeCV < 0.15) incomeScore += 40;
  else if (incomeCV < 0.30) incomeScore += 30;
  else if (incomeCV < 0.50) incomeScore += 15;
  incomeScore = Math.min(incomeScore, 80);

  // 3. Expense Control (0–120)
  const expenseRatio = avgMonthlyIncome > 0 ? avgMonthlyExpenses / avgMonthlyIncome : 1;
  let expenseScore =
    expenseRatio < 0.50 ? 120 :
    expenseRatio < 0.60 ? 100 :
    expenseRatio < 0.70 ? 80  :
    expenseRatio < 0.80 ? 60  :
    expenseRatio < 0.90 ? 40  :
    expenseRatio < 1.00 ? 20  : 0;

  // Penalise rapid expense growth
  if (trend.length >= 3) {
    const prev = trend[trend.length - 2];
    const last = trend[trend.length - 1];
    if (prev.expenses > 0 && last.expenses > prev.expenses * 1.3) {
      expenseScore = Math.max(0, expenseScore - 20);
    }
  }
  expenseScore = Math.min(expenseScore, 120);

  // 4. Budget Health (0–100)
  let budgetScore = 0;
  const lastMonth = trend[trend.length - 1] ?? { income: 0, expenses: 0 };
  const currentNet = lastMonth.income - lastMonth.expenses;
  if      (currentNet > 0)  budgetScore += 40;
  else if (currentNet === 0) budgetScore += 10;

  const recentSlice = trend.slice(-3);
  const negativeMonths = recentSlice.filter((m) => (m.income - m.expenses) < 0).length;
  if      (negativeMonths === 0) budgetScore += 40;
  else if (negativeMonths === 1) budgetScore += 20;

  const availableRatio = avgMonthlyIncome > 0 ? (avgMonthlyIncome - avgMonthlyExpenses) / avgMonthlyIncome : 0;
  if      (availableRatio > 0.30) budgetScore += 20;
  else if (availableRatio > 0.10) budgetScore += 10;
  budgetScore = Math.min(budgetScore, 100);

  // 5. Financial Trend (0–80)
  let trendScore = 40; // neutral baseline
  if (trend.length >= 3) {
    const first = trend[0];
    const last  = trend[trend.length - 1];
    const firstNet = first.income - first.expenses;
    const lastNet  = last.income  - last.expenses;
    if      (lastNet > firstNet)  trendScore += 25;
    else if (lastNet < firstNet)  trendScore -= 20;

    const firstRatio = first.income > 0 ? first.expenses / first.income : 1;
    const lastRatio  = last.income  > 0 ? last.expenses  / last.income  : 1;
    if      (lastRatio < firstRatio) trendScore += 15;
    else if (lastRatio > firstRatio) trendScore -= 10;
  }
  trendScore = Math.max(0, Math.min(trendScore, 80));

  const rawScore = Math.min(500, Math.max(0, savingsScore + incomeScore + expenseScore + budgetScore + trendScore));

  return {
    savingsConsistency: savingsScore,
    incomeStability:    incomeScore,
    expenseControl:     expenseScore,
    budgetHealth:       budgetScore,
    financialTrend:     trendScore,
    rawScore,
  };
};

// ── AI interpretation ─────────────────────────────────────────────────────────

const callAI = async ({ rawScore, metrics, context }) => {
  const prompt = `You are a friendly financial wellness coach. Interpret the financial health metrics below and respond with ONLY a valid JSON object — no markdown, no explanation.

Raw Score: ${rawScore} / 500
Component Scores:
  Savings Consistency: ${metrics.savingsConsistency} / 120
  Income Stability:    ${metrics.incomeStability} / 80
  Expense Control:     ${metrics.expenseControl} / 120
  Budget Health:       ${metrics.budgetHealth} / 100
  Financial Trend:     ${metrics.financialTrend} / 80

User Context:
  Months of data: ${context.monthsOfData}
  Avg monthly income: ${Math.round(context.avgMonthlyIncome)}
  Avg monthly expenses: ${Math.round(context.avgMonthlyExpenses)}
  Active savings goals: ${context.activeSavingsGoals}
  Savings rate: ${context.savingsRate}%

JSON format (respond with ONLY this):
{
  "scoreAdjustment": integer between -15 and 15,
  "statusLabel": one of ["Needs Attention", "Improving", "Stable", "Strong", "Excellent"],
  "headline": "motivating phrase, max 7 words",
  "positives": ["1 specific positive observation", "optional second if very different"],
  "negatives": ["1 area needing improvement, or omit array items if score is Strong/Excellent"],
  "suggestions": ["1 actionable thing the user can do this month", "optional second suggestion"]
}`;

  const { data } = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      max_tokens: 400,
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

  const raw   = data.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI response contained no JSON");

  const parsed = JSON.parse(match[0]);
  const adjustment = Math.max(-15, Math.min(15, Number(parsed.scoreAdjustment) || 0));

  return {
    adjustment,
    statusLabel: String(parsed.statusLabel ?? ""),
    headline:    String(parsed.headline    ?? ""),
    positives:   Array.isArray(parsed.positives)    ? parsed.positives.map(String)    : [],
    negatives:   Array.isArray(parsed.negatives)    ? parsed.negatives.map(String)    : [],
    suggestions: Array.isArray(parsed.suggestions)  ? parsed.suggestions.map(String)  : [],
  };
};

// ── Format cached document for API response ───────────────────────────────────

const formatScore = (doc) => ({
  score:       doc.score,
  statusLabel: doc.statusLabel,
  headline:    doc.headline,
  positives:   doc.positives,
  negatives:   doc.negatives,
  suggestions: doc.suggestions,
  metrics:     doc.metrics,
  generatedAt: doc.generatedAt,
});

// ── Main service ──────────────────────────────────────────────────────────────

export const financialScoreService = {
  getScore: async (userId, forceRefresh = false) => {
    if (!env.OPENAI_API_KEY) return null;

    // ── 0. Premium gate ───────────────────────────────────────────────────────
    // AI features are premium-only. Free users receive a locked preview signal
    // so the frontend can render a blurred placeholder with an upgrade CTA.
    const sub = await Subscription.findOne({ userId }).lean();
    if (!isPremiumActive(sub)) {
      return { locked: true, reason: "premium_required" };
    }

    // ── 1. Gather raw data ───────────────────────────────────────────────────
    const [
      trend,
      allTimeExpenses,
      allTimeIncome,
      activeSavingsGoals,
      goalsWithDeposits,
      totalSavingsAmount,
      user,
    ] = await Promise.all([
      analyticsService.getTrend(userId, 6),
      expenseRepository.sumByFilter({ userId }),
      incomeRepository.sumByFilter({ userId }),
      SavingGoal.countDocuments({ userId, status: "active" }),
      SavingGoal.countDocuments({ userId, status: "active", currentAmount: { $gt: 0 } }),
      SavingGoal.aggregate([
        { $match: { userId, status: "active" } },
        { $group: { _id: null, total: { $sum: "$currentAmount" } } },
      ]).then((r) => r[0]?.total ?? 0),
      User.findOne({ userId }, { createdAt: 1 }).lean(),
    ]);

    const totalIncomeCount  = allTimeIncome[0]?.count   ?? 0;
    const totalExpenseCount = allTimeExpenses[0]?.count ?? 0;

    // ── 2. Minimum data gate ─────────────────────────────────────────────────
    const accountAgeDays = user
      ? (Date.now() - new Date(user.createdAt)) / 86_400_000
      : 0;

    if (
      accountAgeDays < MIN_ACCOUNT_AGE_DAYS ||
      totalIncomeCount  < MIN_INCOME_ENTRIES ||
      totalExpenseCount < MIN_EXPENSE_ENTRIES
    ) {
      return null; // frontend shows "Building your score…"
    }

    // ── 3. Compute raw metrics ────────────────────────────────────────────────
    const monthsOfData        = trend.length;
    const avgMonthlyIncome    = monthsOfData > 0 ? trend.reduce((s, m) => s + m.income,   0) / monthsOfData : 0;
    const avgMonthlyExpenses  = monthsOfData > 0 ? trend.reduce((s, m) => s + m.expenses, 0) / monthsOfData : 0;
    const savingsRatePct      = avgMonthlyIncome > 0
      ? ((totalSavingsAmount / avgMonthlyIncome) * 100).toFixed(1)
      : "0.0";

    const metricData = { trend, avgMonthlyIncome, avgMonthlyExpenses, activeSavingsGoals, goalsWithDeposits, totalSavingsAmount, monthsOfData };
    const { rawScore, ...componentScores } = computeMetrics(metricData);
    const metrics = componentScores;

    // ── 4. Check cache ────────────────────────────────────────────────────────
    const snapshotHash = computeSnapshotHash({ avgMonthlyIncome, avgMonthlyExpenses, totalIncomeCount, totalExpenseCount, activeSavingsGoals, monthsOfData });

    if (!forceRefresh) {
      // Layer 1: identical data snapshot → return cached immediately
      const snapCached = await FinancialScore.findOne({ userId, snapshotHash }).lean();
      if (snapCached) return formatScore(snapCached);

      // Layer 2: data changed but within 14-day refresh window → return latest
      const latest = await FinancialScore.findOne({ userId }).sort({ generatedAt: -1 }).lean();
      if (latest) {
        const daysSinceLast = (Date.now() - new Date(latest.generatedAt)) / 86_400_000;
        if (daysSinceLast < REFRESH_DAYS) return formatScore(latest);
      }
    }

    // ── 5. Check monthly AI limit (premium cap: 10 per calendar month) ───────
    const monthKey         = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const aiCallsThisMonth = await FinancialScore.countDocuments({ userId, monthKey });

    if (aiCallsThisMonth >= PREMIUM_MONTHLY_AI_LIMIT) {
      // Limit hit — return latest cached, or fall back to raw score without AI text
      const latest = await FinancialScore.findOne({ userId }).sort({ generatedAt: -1 }).lean();
      if (latest) return formatScore(latest);

      // No cache at all yet (edge case) — return raw score with no AI explanation
      return {
        score:       rawScore,
        statusLabel: statusFromScore(rawScore),
        headline:    "",
        positives:   [],
        negatives:   [],
        suggestions: ["Keep tracking your finances — insights available soon."],
        metrics,
        generatedAt: new Date(),
      };
    }

    // ── 6. Call AI and cache ──────────────────────────────────────────────────
    try {
      const context = { monthsOfData, avgMonthlyIncome, avgMonthlyExpenses, activeSavingsGoals, savingsRate: savingsRatePct };
      const ai = await callAI({ rawScore, metrics, context });

      const finalScore = Math.min(500, Math.max(0, rawScore + ai.adjustment));
      const statusLabel = ai.statusLabel || statusFromScore(finalScore);

      const doc = await FinancialScore.findOneAndUpdate(
        { userId, snapshotHash },
        {
          $set: {
            monthKey,
            score:       finalScore,
            statusLabel,
            headline:    ai.headline,
            positives:   ai.positives,
            negatives:   ai.negatives,
            suggestions: ai.suggestions,
            metrics,
            generatedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      ).lean();

      return formatScore(doc);
    } catch (err) {
      logger.error({ event: "financial_score_ai_error", userId, err: err.message });
      // AI failed — return latest cached or a raw score fallback
      const latest = await FinancialScore.findOne({ userId }).sort({ generatedAt: -1 }).lean();
      if (latest) return formatScore(latest);

      return {
        score:       rawScore,
        statusLabel: statusFromScore(rawScore),
        headline:    "",
        positives:   [],
        negatives:   [],
        suggestions: ["Keep tracking your finances for a full score analysis."],
        metrics,
        generatedAt: new Date(),
      };
    }
  },
};
