// ── Intent Classifier ─────────────────────────────────────────────────────────
// Pure utility — no I/O, no imports.
//
// Type A: direct data questions answered from the DB, zero AI cost.
// Type B: analytical/advisory questions that require OpenAI.
//
// Classification is order-sensitive: first matching Type A rule wins.
// Anything that does not match a Type A rule falls through to Type B.

// ── Type A rules ──────────────────────────────────────────────────────────────

const TYPE_A_RULES = [
  // Balance / available funds
  {
    handler: "balance",
    patterns: [
      /\bbalance\b/i,
      /how much .*(do i have|have i got|is left|left in|available)\b/i,
      /what.s my .*(balance|total|funds)\b/i,
      /\bavailable\b.*\b(funds|money|cash)\b/i,
    ],
  },
  // Monthly spend (no category specified)
  {
    handler: "monthlySpend",
    patterns: [
      /how much (did i |have i |have i been )?spend(ing)? (this month|last month|today|this week|this year)/i,
      /total (spend|spent|expenses|spending)\b/i,
      /\bexpenses? this month\b/i,
      /\bmonthly (spend|expenses?)\b/i,
      /how much (am i |have i )?spent?\b/i,
    ],
  },
  // Category-specific spend
  {
    handler: "categorySpend",
    patterns: [
      /how much (did i |have i |am i )?(spend(ing)?|spent) on (.+)/i,
      /\b(food|groceries|grocery|transport|transportation|travel|entertainment|dining|eating out|restaurant|shopping|utilities|bills|rent|health|gym|clothing|clothes|education)\b.*\b(spend|cost|total|spending|expenses?)\b/i,
      /\b(spend|cost|total|spending|expenses?)\b.*\b(food|groceries|grocery|transport|transportation|travel|entertainment|dining|eating out|restaurant|shopping|utilities|bills|rent|health|gym|clothing|clothes|education)\b/i,
    ],
  },
  // Subscriptions / recurring
  {
    handler: "subscriptions",
    patterns: [
      /\bsubscription(s)?\b/i,
      /\brecurring\b/i,
      /what (am i |am i currently )?paying for\b/i,
      /\bmonthly (payments?|bills?|charges?)\b/i,
      /\bmy subscriptions?\b/i,
    ],
  },
  // Income
  {
    handler: "income",
    patterns: [
      /\b(my |this month.s |monthly )?income\b/i,
      /how much (did i |have i )?(earn(ed)?|made|received|got paid|brought in)\b/i,
      /\b(salary|wages?|pay)\b.*\b(this month|received|total)\b/i,
    ],
  },
  // Savings / goals
  {
    handler: "savings",
    patterns: [
      /how much (have i |did i )?(saved?|put aside|set aside)\b/i,
      /\b(my |total |current )?savings? (goals?|balance|total|amount|progress)?\b/i,
      /\bsaving goals?\b/i,
      /what.s? (in )?(my )?savings?\b/i,
    ],
  },
  // Largest / biggest expense
  {
    handler: "largestExpense",
    patterns: [
      /\b(largest|biggest|highest|top|most expensive)\b.*\b(expense|spend|purchase|transaction|item)\b/i,
      /\bexpense\b.*\b(largest|biggest|highest|most)\b/i,
      /what did i spend the most on\b/i,
    ],
  },
  // Recent transactions
  {
    handler: "recentTransactions",
    patterns: [
      /\b(recent|last|latest) (transactions?|purchases?|payments?|expenses?|spending)\b/i,
      /\bwhat did i (buy|spend|pay) (recently|lately|last week|yesterday)\b/i,
      /\bmy last \d+ (transactions?|purchases?|expenses?)\b/i,
      /\btransaction history\b/i,
    ],
  },
];

// ── Category entity extraction ────────────────────────────────────────────────
// Used by the categorySpend handler to know which category to query.

const KNOWN_CATEGORIES = [
  "food", "groceries", "grocery", "transport", "transportation", "travel",
  "entertainment", "dining", "restaurant", "shopping", "utilities", "bills",
  "rent", "health", "gym", "clothing", "clothes", "education", "fitness",
  "coffee", "takeaway", "takeout",
];

const extractCategory = (text) => {
  const lower = text.toLowerCase();
  return KNOWN_CATEGORIES.find((cat) => lower.includes(cat)) ?? null;
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify a question.
 * @returns {{ type: "A"|"B", handler?: string, category?: string }}
 */
export const classifyIntent = (text) => {
  for (const rule of TYPE_A_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      const result = { type: "A", handler: rule.handler };
      if (rule.handler === "categorySpend") {
        result.category = extractCategory(text);
      }
      return result;
    }
  }
  return { type: "B" };
};

/**
 * Normalise a question for cache-key hashing:
 * lowercase, collapse whitespace, strip punctuation, trim.
 */
export const normaliseQuestion = (text) =>
  text.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
