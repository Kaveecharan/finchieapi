import crypto   from "crypto";
import axios    from "axios";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../errors/AppError.js";
import { classifyIntent, normaliseQuestion } from "../utils/intentClassifier.js";
import { financialContextService } from "./financialContext.service.js";
import { analyticsService } from "./analytics.service.js";
import SavingGoal from "../models/SavingGoal.js";
import { expenseRepository } from "../repositories/expense.repository.js";
import ChatConversation, { MAX_MESSAGES, HISTORY_WINDOW } from "../models/ChatConversation.js";
import ChatUsage, { MONTHLY_AI_LIMIT, DAILY_AI_LIMIT, MSG_COOLDOWN_MS } from "../models/ChatUsage.js";
import ChatCache from "../models/ChatCache.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const monthKey = () => new Date().toISOString().slice(0, 7);
const dayKey   = () => new Date().toISOString().slice(0, 10);
const fmt      = (n) => `£${Math.abs(Math.round(n)).toLocaleString("en-GB")}`;

// ── Type A handlers — zero AI cost, answered directly from the DB ─────────────

const typeAHandlers = {
  balance: async (userId) => {
    const dashboard = await analyticsService.getDashboard(userId, null);
    const { summary } = dashboard;
    const balance  = Math.round(summary.availableBalance ?? summary.netBalance ?? 0);
    const income   = Math.round(summary.totalIncome);
    const expenses = Math.round(summary.totalExpenses);
    const net      = income - expenses;
    const sign     = net >= 0 ? "+" : "-";
    return `Your current balance is ${fmt(balance)}. This month you've earned ${fmt(income)} and spent ${fmt(expenses)}, a net of ${sign}${fmt(Math.abs(net))}.`;
  },

  monthlySpend: async (userId) => {
    const dashboard = await analyticsService.getDashboard(userId, null);
    const { summary, charts } = dashboard;
    const top = charts.expenseByCategory?.[0];
    const base = `You've spent ${fmt(summary.totalExpenses)} this month.`;
    return top
      ? `${base} Your top category is ${top.name} at ${fmt(top.total)}.`
      : base;
  },

  categorySpend: async (userId, category) => {
    const dashboard = await analyticsService.getDashboard(userId, null);
    const { charts, summary } = dashboard;
    if (!category) {
      return `You've spent ${fmt(summary.totalExpenses)} in total this month across all categories.`;
    }
    const found = (charts.expenseByCategory ?? []).find(
      (c) => c.name.toLowerCase().includes(category.toLowerCase())
    );
    if (!found) {
      return `I couldn't find any spending in "${category}" this month. You may not have any transactions in that category yet.`;
    }
    const sharePct = summary.totalExpenses > 0
      ? ((found.total / summary.totalExpenses) * 100).toFixed(0)
      : 0;
    return `You've spent ${fmt(found.total)} on ${found.name} this month — that's ${sharePct}% of your total expenses.`;
  },

  subscriptions: async (userId) => {
    const dashboard = await analyticsService.getDashboard(userId, null);
    const recurring = (dashboard.charts.topItems ?? [])
      .filter((i) => i.isRecurring || i.occurrences >= 2)
      .slice(0, 6);
    if (!recurring.length) {
      return "I couldn't detect any clear recurring subscriptions this month. Items that repeat across months will appear here once you have more history.";
    }
    const total = recurring.reduce((s, i) => s + (i.total / (i.occurrences || 1)), 0);
    const list  = recurring.map((i) => `${i.name} (${fmt(i.total / (i.occurrences || 1))})`).join(", ");
    return `Your recurring payments this month total approximately ${fmt(total)}: ${list}.`;
  },

  income: async (userId) => {
    const dashboard = await analyticsService.getDashboard(userId, null);
    const { summary, charts } = dashboard;
    const sources = charts.incomeByType ?? [];
    if (sources.length <= 1) {
      return `Your income this month is ${fmt(summary.totalIncome)}.`;
    }
    const breakdown = sources.slice(0, 3).map((s) => `${s.type || s.name}: ${fmt(s.total)}`).join(", ");
    return `Your total income this month is ${fmt(summary.totalIncome)}, across ${sources.length} sources: ${breakdown}.`;
  },

  savings: async (userId) => {
    const goals = await SavingGoal.find({ userId, status: "active" }).lean();
    if (!goals.length) {
      return "You don't have any active savings goals yet. You can create one in the Savings section.";
    }
    const totalSaved  = goals.reduce((s, g) => s + (g.currentAmount ?? 0), 0);
    const totalTarget = goals.reduce((s, g) => s + (g.targetAmount  ?? 0), 0);
    const list = goals.slice(0, 3)
      .map((g) => `${g.name}: ${fmt(g.currentAmount)} of ${fmt(g.targetAmount)}`)
      .join(", ");
    return `You have ${goals.length} active goal${goals.length > 1 ? "s" : ""} with ${fmt(totalSaved)} saved of a ${fmt(totalTarget)} total target. ${list}.`;
  },

  largestExpense: async (userId) => {
    const dashboard = await analyticsService.getDashboard(userId, null);
    const top = (dashboard.charts.topItems ?? [])[0];
    if (!top) return "No expense transactions found this month.";
    return `Your largest expense this month is "${top.name}" at ${fmt(top.total)}${top.category ? ` (${top.category})` : ""}.`;
  },

  recentTransactions: async (userId) => {
    const { items } = await expenseRepository.findPaginated(
      { userId }, { date: -1 }, 0, 5
    );
    if (!items?.length) return "No recent transactions found.";
    const list = items
      .map((t) => `${t.name ?? t.description ?? "Transaction"}: ${fmt(t.amount)}`)
      .join(", ");
    return `Your 5 most recent expenses: ${list}.`;
  },
};

// ── AI call ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a concise personal finance assistant. The user's real financial data is provided.
Rules:
- Answer in 100–200 words maximum.
- Be practical and specific — use the numbers provided.
- Never give generic advice (e.g. "consider budgeting").
- If the user asks something you cannot answer from the data, say so briefly.
- Plain text only, no markdown, no bullet symbols.`;

const callAI = async (question, context, history) => {
  const contextStr = JSON.stringify(context);

  const messages = [
    { role: "system",    content: SYSTEM_PROMPT },
    { role: "user",      content: `Financial summary:\n${contextStr}` },
    { role: "assistant", content: "Understood. Ask me anything about your finances." },
    ...history,
    { role: "user",      content: question },
  ];

  const { data } = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model:       "gpt-4o-mini",
      max_tokens:  250,
      temperature: 0.4,
      messages,
    },
    {
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type":  "application/json",
      },
      timeout: 20_000,
    }
  );

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty response from OpenAI");
  return content;
};

// ── Usage helpers ─────────────────────────────────────────────────────────────

const getOrCreateUsage = async (userId) => {
  const mk = monthKey();
  return ChatUsage.findOneAndUpdate(
    { userId, monthKey: mk },
    { $setOnInsert: { userId, monthKey: mk } },
    { upsert: true, new: true }
  );
};

const incrementAiUsage = async (userId) => {
  const mk = monthKey();
  const dk = dayKey();
  await ChatUsage.findOneAndUpdate(
    { userId, monthKey: mk },
    {
      $inc: { aiCallsMonth: 1, totalMsgsMonth: 1 },
      $set: { lastMessageAt: new Date() },
      // Reset daily counter when day changes
      $setOnInsert: { dayKey: dk, aiCallsDay: 0 },
    },
    { upsert: true }
  );
  // Handle daily counter separately (may need reset)
  const doc = await ChatUsage.findOne({ userId, monthKey: mk });
  if (doc.dayKey !== dk) {
    await ChatUsage.updateOne(
      { userId, monthKey: mk },
      { $set: { dayKey: dk, aiCallsDay: 1 } }
    );
  } else {
    await ChatUsage.updateOne(
      { userId, monthKey: mk },
      { $inc: { aiCallsDay: 1 } }
    );
  }
};

const incrementMsgCount = async (userId) => {
  const mk = monthKey();
  await ChatUsage.findOneAndUpdate(
    { userId, monthKey: mk },
    {
      $inc: { totalMsgsMonth: 1 },
      $set: { lastMessageAt: new Date() },
    },
    { upsert: true }
  );
};

// ── Conversation helpers ──────────────────────────────────────────────────────

const appendMessages = async (userId, userText, assistantText, type) => {
  const now = new Date();
  await ChatConversation.findOneAndUpdate(
    { userId },
    {
      $push: {
        messages: {
          $each: [
            { role: "user",      content: userText,      type, createdAt: now },
            { role: "assistant", content: assistantText, type, createdAt: now },
          ],
          $slice: -MAX_MESSAGES, // keep only the latest MAX_MESSAGES
        },
      },
    },
    { upsert: true }
  );
};

const getHistoryForAI = async (userId) => {
  const doc = await ChatConversation.findOne({ userId }, { messages: 1 }).lean();
  if (!doc?.messages?.length) return [];
  // Last HISTORY_WINDOW user+assistant pairs → 2*HISTORY_WINDOW entries
  return doc.messages.slice(-(HISTORY_WINDOW * 2)).map(({ role, content }) => ({ role, content }));
};

// ── Public service ────────────────────────────────────────────────────────────

export const chatService = {
  // ── Send a message and return the assistant response ─────────────────────
  sendMessage: async (userId, text) => {
    if (!env.OPENAI_API_KEY) {
      throw new AppError("AI assistant is not configured.", 503, "AI_UNAVAILABLE");
    }

    const trimmed = text?.trim();
    if (!trimmed || trimmed.length > 500) {
      throw new AppError("Message must be between 1 and 500 characters.", 400, "INVALID_MESSAGE");
    }

    // ── Rate limit: cooldown between any two messages ─────────────────────
    const usage = await getOrCreateUsage(userId);
    if (usage.lastMessageAt) {
      const elapsed = Date.now() - new Date(usage.lastMessageAt).getTime();
      if (elapsed < MSG_COOLDOWN_MS) {
        const retryAfter = Math.ceil((MSG_COOLDOWN_MS - elapsed) / 1000);
        const err = new AppError("Please wait before sending another message.", 429, "COOLDOWN");
        err.retryAfter = retryAfter;
        throw err;
      }
    }

    // ── Classify intent ───────────────────────────────────────────────────
    const { type, handler, category } = classifyIntent(trimmed);

    // ── Type A: answer directly from DB, no AI cost ───────────────────────
    if (type === "A" && typeAHandlers[handler]) {
      const response = await typeAHandlers[handler](userId, category);
      await Promise.all([
        appendMessages(userId, trimmed, response, "A"),
        incrementMsgCount(userId),
      ]);
      return { response, type: "A", aiRemaining: MONTHLY_AI_LIMIT - usage.aiCallsMonth };
    }

    // ── Type B: AI-powered analytical answer ──────────────────────────────

    // Daily AI cap (abuse ceiling)
    const dk = dayKey();
    const dailyCount = usage.dayKey === dk ? usage.aiCallsDay : 0;
    if (dailyCount >= DAILY_AI_LIMIT) {
      const response = `You've reached today's AI question limit (${DAILY_AI_LIMIT}/day). Your limit resets at midnight. In the meantime, I can still answer direct questions like "What's my balance?" or "How much did I spend this month?"`;
      await appendMessages(userId, trimmed, response, "quota");
      return { response, type: "quota", aiRemaining: 0 };
    }

    // Monthly AI cap
    if (usage.aiCallsMonth >= MONTHLY_AI_LIMIT) {
      const response = `You've used all ${MONTHLY_AI_LIMIT} AI questions for this month. Your allowance resets on the 1st. I can still answer direct data questions — just ask things like "What's my balance?" or "What did I spend on food?"`;
      await appendMessages(userId, trimmed, response, "quota");
      return { response, type: "quota", aiRemaining: 0 };
    }

    // Build financial context
    const context      = await financialContextService.build(userId);
    const snapshotHash = financialContextService.hash(context);
    const questionHash = crypto
      .createHash("sha256")
      .update(normaliseQuestion(trimmed))
      .digest("hex")
      .slice(0, 32);

    // Cache check: same user + same financial state + same question = free response
    const cached = await ChatCache.findOne({ userId, snapshotHash, questionHash }).lean();
    if (cached) {
      logger.info({ event: "chat_cache_hit", userId });
      await Promise.all([
        appendMessages(userId, trimmed, cached.response, "B"),
        incrementMsgCount(userId),
      ]);
      return {
        response:     cached.response,
        type:         "B",
        cached:       true,
        aiRemaining:  MONTHLY_AI_LIMIT - usage.aiCallsMonth,
      };
    }

    // Call OpenAI
    const history = await getHistoryForAI(userId);

    let response;
    try {
      response = await callAI(trimmed, context, history);
    } catch (err) {
      logger.error({ event: "chat_ai_error", userId, err: err.message });
      throw new AppError("Failed to get a response. Please try again.", 502, "AI_ERROR");
    }

    // Persist: cache + conversation + usage (all fire together)
    await Promise.all([
      ChatCache.findOneAndUpdate(
        { userId, snapshotHash, questionHash },
        { $set: { response, createdAt: new Date() } },
        { upsert: true }
      ),
      appendMessages(userId, trimmed, response, "B"),
      incrementAiUsage(userId),
    ]);

    logger.info({ event: "chat_ai_call", userId, aiCallsMonth: usage.aiCallsMonth + 1 });

    return {
      response,
      type:        "B",
      cached:      false,
      aiRemaining: MONTHLY_AI_LIMIT - usage.aiCallsMonth - 1,
    };
  },

  // ── Get conversation history ──────────────────────────────────────────────
  getHistory: async (userId, limit = 40) => {
    const doc = await ChatConversation.findOne({ userId }).lean();
    const messages = doc?.messages ?? [];
    return messages.slice(-limit);
  },

  // ── Get usage stats ───────────────────────────────────────────────────────
  getUsage: async (userId) => {
    const usage = await getOrCreateUsage(userId);
    const dk    = dayKey();
    return {
      aiCallsMonth:   usage.aiCallsMonth,
      aiRemaining:    Math.max(0, MONTHLY_AI_LIMIT - usage.aiCallsMonth),
      monthlyLimit:   MONTHLY_AI_LIMIT,
      dailyRemaining: Math.max(0, DAILY_AI_LIMIT - (usage.dayKey === dk ? usage.aiCallsDay : 0)),
      dailyLimit:     DAILY_AI_LIMIT,
      resetsOn:       new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
    };
  },

  // ── Clear conversation ────────────────────────────────────────────────────
  clearHistory: async (userId) => {
    await ChatConversation.findOneAndUpdate(
      { userId },
      { $set: { messages: [] } },
      { upsert: true }
    );
  },
};
