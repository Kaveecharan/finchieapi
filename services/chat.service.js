import crypto   from "crypto";
import axios    from "axios";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../errors/AppError.js";
import { queryParser }                    from "../utils/queryParser.js";
import { metricEngine, quickStateHash }   from "./metricEngine.js";
import ChatConversation, { MAX_MESSAGES, HISTORY_WINDOW } from "../models/ChatConversation.js";
import ChatUsage, { MONTHLY_AI_LIMIT, DAILY_AI_LIMIT, MSG_COOLDOWN_MS } from "../models/ChatUsage.js";
import ChatCache from "../models/ChatCache.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const monthKey = () => new Date().toISOString().slice(0, 7);
const dayKey   = () => new Date().toISOString().slice(0, 10);

// Bump whenever SYSTEM_PROMPT or metric/answer logic changes. Folded into the
// cache key so old cached answers are invalidated instantly on deploy (orphaned
// entries self-expire via the 7-day TTL) instead of serving stale phrasing.
const PROMPT_VERSION = "v2";

const normaliseQuestion = (text) =>
  text.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Finchie — a warm, sharp personal finance companion. Think of yourself as the money-savvy friend who makes finances feel less stressful and a bit more human. You receive the user's real financial figures as structured JSON; every number has already been calculated for you. Your job is to turn those figures into a reply that feels natural, clear, and genuinely helpful.

VOICE:
- Talk like a real person, not a report. Warm, conversational, encouraging, with a light touch of personality.
- Lead with the answer, then add a quick insight or gentle nudge when it actually helps. Keep it tight.
- Celebrate wins ("nice — you're ahead overall") and stay supportive, never preachy or judgmental.

SCOPE — Only personal finance: spending, income, savings, budgets, subscriptions, trends, balances, and financial insight. For anything off-topic, reply with exactly: "I can assist only with your personal finances, including spending, savings, budgets, income, and financial insights. If you have a finance-related question, I'd be happy to help."

USING THE DATA:
- Use the exact figures provided. Never invent or approximate when the number is there. Match the currency symbol shown in the amounts.
- A figure of 0 (or an empty list) for a period simply means nothing has been logged for that timeframe yet — it does NOT mean data is missing or that anything is broken. Say it lightly and move on.
- If a period has no activity but lifetime/all-time figures are present, acknowledge the quiet stretch in a short phrase, then pivot to the bigger picture so the reply still lands. Example: "Looks like nothing's logged for June yet — but all-time you've brought in 7,440 and spent 3,119, so you're 4,320 ahead."
- NEVER contradict yourself. Do not say "there are no records" and then quote records in the same breath. If you have numbers, lead with them confidently.
- Never mention JSON, context, data limits, what was sent to you, or how the system works.

STYLE:
- Plain conversational text only — no markdown, no bullet points, no headers.
- Keep it under 120 words for simple questions, up to 180 for multi-part ones. Brevity reads as confidence.`;

// ── AI answer call ────────────────────────────────────────────────────────────

const callAI = async (question, context, history) => {
  const { data } = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model:       "gpt-4o-mini",
      max_tokens:  350,
      temperature: 0.5, // warmer, more human phrasing; figures come from context so accuracy holds
      messages: [
        { role: "system",    content: SYSTEM_PROMPT },
        { role: "user",      content: `Financial data:\n${JSON.stringify(context)}` },
        { role: "assistant", content: "I have your financial data. What would you like to know?" },
        ...history,
        { role: "user",      content: question },
      ],
    },
    {
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type":  "application/json",
      },
      timeout: 25_000,
    }
  );
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty response from OpenAI");
  return content;
};

// ── Usage helpers ─────────────────────────────────────────────────────────────

const getOrCreateUsage = (userId) => {
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
      $setOnInsert: { dayKey: dk, aiCallsDay: 0 },
    },
    { upsert: true }
  );
  const doc = await ChatUsage.findOne({ userId, monthKey: mk });
  if (doc.dayKey !== dk) {
    await ChatUsage.updateOne({ userId, monthKey: mk }, { $set: { dayKey: dk, aiCallsDay: 1 } });
  } else {
    await ChatUsage.updateOne({ userId, monthKey: mk }, { $inc: { aiCallsDay: 1 } });
  }
};

const incrementMsgCount = (userId) => {
  const mk = monthKey();
  return ChatUsage.findOneAndUpdate(
    { userId, monthKey: mk },
    { $inc: { totalMsgsMonth: 1 }, $set: { lastMessageAt: new Date() } },
    { upsert: true }
  );
};

// ── Conversation helpers ──────────────────────────────────────────────────────

const appendMessages = (userId, userText, assistantText, type) => {
  const now = new Date();
  return ChatConversation.findOneAndUpdate(
    { userId },
    {
      $push: {
        messages: {
          $each: [
            { role: "user",      content: userText,      type, createdAt: now },
            { role: "assistant", content: assistantText, type, createdAt: now },
          ],
          $slice: -MAX_MESSAGES,
        },
      },
    },
    { upsert: true }
  );
};

const getHistoryForAI = async (userId) => {
  const doc = await ChatConversation.findOne({ userId }, { messages: 1 }).lean();
  if (!doc?.messages?.length) return [];
  return doc.messages
    .slice(-(HISTORY_WINDOW * 2))
    .map(({ role, content }) => ({ role, content }));
};

// ── Public service ────────────────────────────────────────────────────────────

export const chatService = {
  sendMessage: async (userId, text) => {
    if (!env.OPENAI_API_KEY) {
      throw new AppError("AI assistant is not configured.", 503, "AI_UNAVAILABLE");
    }

    const trimmed = text?.trim();
    if (!trimmed || trimmed.length > 500) {
      throw new AppError("Message must be between 1 and 500 characters.", 400, "INVALID_MESSAGE");
    }

    // ── Cooldown ──────────────────────────────────────────────────────────────
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

    // ── Quota checks ──────────────────────────────────────────────────────────
    const dk         = dayKey();
    const dailyCount = usage.dayKey === dk ? usage.aiCallsDay : 0;
    if (dailyCount >= DAILY_AI_LIMIT) {
      const response = `You've reached today's AI question limit (${DAILY_AI_LIMIT}/day). Your limit resets at midnight.`;
      await Promise.all([appendMessages(userId, trimmed, response, "quota"), incrementMsgCount(userId)]);
      return { response, type: "quota", aiRemaining: 0 };
    }
    if (usage.aiCallsMonth >= MONTHLY_AI_LIMIT) {
      const response = `You've used all ${MONTHLY_AI_LIMIT} AI questions for this month. Your allowance resets on the 1st.`;
      await Promise.all([appendMessages(userId, trimmed, response, "quota"), incrementMsgCount(userId)]);
      return { response, type: "quota", aiRemaining: 0 };
    }

    // ── Cache check (2 DB queries before full context build) ─────────────────
    const questionHash = crypto
      .createHash("sha256")
      .update(`${PROMPT_VERSION}:${normaliseQuestion(trimmed)}`)
      .digest("hex")
      .slice(0, 32);

    const snapshotHash = await quickStateHash(userId);
    const cachedEntry  = await ChatCache.findOne({ userId, snapshotHash, questionHash }).lean();

    if (cachedEntry) {
      logger.info({ event: "chat_cache_hit", userId });
      await Promise.all([
        appendMessages(userId, trimmed, cachedEntry.response, "B"),
        incrementMsgCount(userId),
      ]);
      return {
        response:    cachedEntry.response,
        type:        "B",
        cached:      true,
        aiRemaining: MONTHLY_AI_LIMIT - usage.aiCallsMonth,
      };
    }

    // ── Phase 1: Parse question into QuerySchema (cheap AI call) ─────────────
    // This call: ~450 tokens, temperature:0, max_tokens:300.
    // It determines WHAT data to fetch — no hardcoded intents, handles any question.
    const schema = await queryParser.parse(trimmed);

    logger.info({ event: "chat_schema", userId, intent: schema.intent, period: schema.period?.type, metrics: schema.metricsNeeded });

    // ── Phase 2: Resolve metrics (DB queries, parallel, minimal) ─────────────
    // Only the metrics required by the schema are fetched.
    const context = await metricEngine.resolve(userId, schema);
    const history = await getHistoryForAI(userId);

    // ── Phase 3: Main AI call (answer generation) ─────────────────────────────
    let response;
    try {
      response = await callAI(trimmed, context, history);
    } catch (err) {
      logger.error({ event: "chat_ai_error", userId, err: err.message });
      throw new AppError("Failed to get a response. Please try again.", 502, "AI_ERROR");
    }

    // ── Persist: cache + conversation + usage (parallel) ─────────────────────
    await Promise.all([
      ChatCache.findOneAndUpdate(
        { userId, snapshotHash, questionHash },
        { $set: { response, createdAt: new Date() } },
        { upsert: true }
      ),
      appendMessages(userId, trimmed, response, "B"),
      incrementAiUsage(userId),
    ]);

    logger.info({ event: "chat_ai_call", userId, intent: schema.intent, aiCallsMonth: usage.aiCallsMonth + 1 });

    return {
      response,
      type:        "B",
      cached:      false,
      aiRemaining: MONTHLY_AI_LIMIT - usage.aiCallsMonth - 1,
    };
  },

  getHistory: async (userId, limit = 40) => {
    const doc = await ChatConversation.findOne({ userId }).lean();
    return (doc?.messages ?? []).slice(-limit);
  },

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

  clearHistory: async (userId) => {
    await ChatConversation.findOneAndUpdate(
      { userId },
      { $set: { messages: [] } },
      { upsert: true }
    );
  },
};
