import axios from "axios";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { financialContextService } from "./financialContext.service.js";
import { financeScoreRepository } from "../repositories/financeScore.repository.js";
import { AppError } from "../errors/AppError.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const RECALC_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const OPENAI_TIMEOUT_MS  = 30_000;

// ── Rating bands ──────────────────────────────────────────────────────────────

export const SCORE_RATINGS = [
  { min: 401, max: 500, label: "Excellent" },
  { min: 301, max: 400, label: "Great"     },
  { min: 201, max: 300, label: "Good"      },
  { min: 101, max: 200, label: "Fair"      },
  { min:   0, max: 100, label: "Poor"      },
];

export function getRating(score) {
  const band = SCORE_RATINGS.find((b) => score >= b.min && score <= b.max);
  return band?.label ?? "Fair";
}

// ── AI prompt ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a financial health scoring AI for a personal finance app.
Analyze the user's financial snapshot and return ONLY a valid JSON object with these exact fields:

{
  "score": <integer 0–500>,
  "summary": <string, 1–2 sentences max 200 chars, encouraging but honest>,
  "strengths": [<up to 3 short strings, each max 80 chars>],
  "weaknesses": [<up to 3 short strings, each max 80 chars>],
  "recommendations": [<up to 3 actionable strings, each max 100 chars>]
}

Score bands: Poor=0–100, Fair=101–200, Good=201–300, Great=301–400, Excellent=401–500.

Scoring criteria (apply all):
- Savings rate ≥20%: +100 pts. 10–19%: +60 pts. 1–9%: +30 pts. 0% or negative: 0 pts.
- Positive net (income > expenses) this month: +80 pts.
- Active savings goals: +20 pts each, max +60 pts.
- Spending trend stable or decreasing: +50 pts. Increasing: 0 pts.
- Available balance > 0: +50 pts. Zero or negative: 0 pts.
- Average income ≥ average expenses: +60 pts. Otherwise: 0 pts.
- Income consistency (has income this period): +50 pts.
- Low expense concentration (no single category > 50% of spend): +50 pts.

Cap total at 500. Be direct, not generic. Return ONLY the JSON, no markdown, no extra text.`;

// ── Core AI call ──────────────────────────────────────────────────────────────

async function callScoringAI(context) {
  if (!env.OPENAI_API_KEY) {
    throw new AppError("OpenAI API key not configured", 503, "SERVICE_UNAVAILABLE");
  }

  const contextStr = JSON.stringify(context);

  const { data } = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model:           "gpt-4o-mini",
      max_tokens:      400,
      temperature:     0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: `Financial snapshot:\n${contextStr}` },
      ],
    },
    {
      headers: {
        Authorization:  `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: OPENAI_TIMEOUT_MS,
    }
  );

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty response from OpenAI scoring");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON scoring response: ${raw.slice(0, 80)}`);
  }

  // Validate and clamp
  const score = Math.min(500, Math.max(0, Math.round(Number(parsed.score) || 0)));

  return {
    score,
    summary:         String(parsed.summary         ?? "").slice(0, 500),
    strengths:       (Array.isArray(parsed.strengths)       ? parsed.strengths       : []).slice(0, 3).map(String),
    weaknesses:      (Array.isArray(parsed.weaknesses)      ? parsed.weaknesses      : []).slice(0, 3).map(String),
    recommendations: (Array.isArray(parsed.recommendations) ? parsed.recommendations : []).slice(0, 3).map(String),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export const financeScoreService = {
  // Calculates and persists a new score. Enforces the 14-day gate unless force=true.
  // Returns { score, scoreChange, isNew, skipped } where skipped=true means gate blocked it.
  calculateForUser: async (userId, { force = false } = {}) => {
    const existing = await financeScoreRepository.findByUserId(userId);

    const now = new Date();

    if (!force && existing && existing.nextCalculationAt > now) {
      return { skipped: true, nextCalculationAt: existing.nextCalculationAt };
    }

    const context  = await financialContextService.build(userId);
    const aiResult = await callScoringAI(context);

    const previousScore = existing?.score ?? null;
    const scoreChange   = previousScore !== null ? aiResult.score - previousScore : null;

    const calculatedAt      = now;
    const nextCalculationAt = new Date(now.getTime() + RECALC_INTERVAL_MS);

    const metrics = {
      balance:     context.balance,
      income:      context.income,
      expenses:    context.expenses,
      savingsRate: context.savingsRate,
      avgIncome:   context.avgIncome,
      avgExpenses: context.avgExpenses,
      activeGoals: context.activeGoals?.length ?? 0,
    };

    const saved = await financeScoreRepository.upsert(userId, {
      score:             aiResult.score,
      rating:            getRating(aiResult.score),
      summary:           aiResult.summary,
      strengths:         aiResult.strengths,
      weaknesses:        aiResult.weaknesses,
      recommendations:   aiResult.recommendations,
      previousScore,
      scoreChange,
      calculatedAt,
      nextCalculationAt,
      metrics,
    });

    logger.info({
      event:   "finance_score_calculated",
      userId,
      score:   aiResult.score,
      rating:  getRating(aiResult.score),
      change:  scoreChange,
    });

    return {
      score:              aiResult.score,
      previousScore,
      scoreChange,
      isNew:              !existing,
      skipped:            false,
      nextCalculationAt,
      saved,
    };
  },

  getCurrent: (userId) =>
    financeScoreRepository.findByUserId(userId),

  getHistory: async (userId) => {
    const doc = await financeScoreRepository.findHistory(userId);
    return doc?.history ?? [];
  },
};
