// Tests: Finance Score service logic
// Verifies: scoring gate, rating bands, history capping, score change calculation,
//           AI result sanitization, and edge-case safety.
// Run: node tests/financeScore.test.mjs

let pass = 0, fail = 0;
const assert = (label, condition) => {
  if (condition) { console.log(`  PASS: ${label}`); pass++; }
  else           { console.error(`  FAIL: ${label}`); fail++; }
};

// ─── Inline copies of pure functions (no DB, no OpenAI) ──────────────────────

const RECALC_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

const SCORE_RATINGS = [
  { min: 401, max: 500, label: "Excellent" },
  { min: 301, max: 400, label: "Great"     },
  { min: 201, max: 300, label: "Good"      },
  { min: 101, max: 200, label: "Fair"      },
  { min:   0, max: 100, label: "Poor"      },
];

function getRating(score) {
  const band = SCORE_RATINGS.find((b) => score >= b.min && score <= b.max);
  return band?.label ?? "Fair";
}

// Simulates the AI result sanitization from callScoringAI
function sanitiseAiResult(parsed) {
  const score = Math.min(500, Math.max(0, Math.round(Number(parsed.score) || 0)));
  return {
    score,
    summary:         String(parsed.summary         ?? "").slice(0, 500),
    strengths:       (Array.isArray(parsed.strengths)       ? parsed.strengths       : []).slice(0, 3).map(String),
    weaknesses:      (Array.isArray(parsed.weaknesses)      ? parsed.weaknesses      : []).slice(0, 3).map(String),
    recommendations: (Array.isArray(parsed.recommendations) ? parsed.recommendations : []).slice(0, 3).map(String),
  };
}

// Simulates the 14-day gate check
function isGatePassed(existing, force = false) {
  if (!existing) return true;     // never scored
  if (force)     return true;     // explicit override
  return existing.nextCalculationAt <= new Date();
}

// Simulates scoreChange calculation
function calcScoreChange(newScore, existing) {
  if (!existing || existing.score == null) return null;
  return newScore - existing.score;
}

// Simulates history capping (newest-first, max 26)
function appendHistory(existing, newEntry, maxLen = 26) {
  const history = existing ? [newEntry, ...(existing.history ?? [])] : [];
  return history.slice(0, maxLen);
}

// ─── T1: getRating bands ─────────────────────────────────────────────────────

console.log("=== T1: Rating band mapping ===\n");

assert("score 0 → Poor",       getRating(0)   === "Poor");
assert("score 100 → Poor",     getRating(100) === "Poor");
assert("score 101 → Fair",     getRating(101) === "Fair");
assert("score 200 → Fair",     getRating(200) === "Fair");
assert("score 201 → Good",     getRating(201) === "Good");
assert("score 300 → Good",     getRating(300) === "Good");
assert("score 301 → Great",    getRating(301) === "Great");
assert("score 400 → Great",    getRating(400) === "Great");
assert("score 401 → Excellent",getRating(401) === "Excellent");
assert("score 500 → Excellent",getRating(500) === "Excellent");

// ─── T2: 14-day gate ─────────────────────────────────────────────────────────

console.log("\n=== T2: 14-day recalculation gate ===\n");

const now = new Date();
const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);  // 7 days from now
const pastDate   = new Date(now.getTime() - 1 * 60 * 1000);             // 1 minute ago

const existingNotDue = { score: 300, nextCalculationAt: futureDate, history: [] };
const existingDue    = { score: 300, nextCalculationAt: pastDate,   history: [] };

assert("never-scored user passes gate",          isGatePassed(null)            === true);
assert("due user passes gate",                   isGatePassed(existingDue)     === true);
assert("not-due user is blocked",                isGatePassed(existingNotDue)  === false);
assert("not-due user passes with force=true",    isGatePassed(existingNotDue, true) === true);

// ─── T3: AI is NOT called before due date ────────────────────────────────────

console.log("\n=== T3: AI skipped when gate is closed ===\n");

let aiCallCount = 0;
function mockCalculateForUser(userId, existing, force = false) {
  if (!isGatePassed(existing, force)) {
    return { skipped: true };
  }
  aiCallCount++;  // simulate AI call
  return { skipped: false, score: 350 };
}

aiCallCount = 0;
const r1 = mockCalculateForUser("user1", existingNotDue, false);
assert("calculate returns skipped=true when gate closed", r1.skipped === true);
assert("AI was NOT called when gate closed",              aiCallCount === 0);

const r2 = mockCalculateForUser("user1", existingDue, false);
assert("calculate runs when due",                         r2.skipped === false);
assert("AI was called when due",                          aiCallCount === 1);

aiCallCount = 0;
const r3 = mockCalculateForUser("user1", existingNotDue, true);
assert("force=true bypasses gate",                        r3.skipped === false);
assert("AI called with force",                            aiCallCount === 1);

// ─── T4: AI called when due ───────────────────────────────────────────────────

console.log("\n=== T4: AI is called when score is due ===\n");

aiCallCount = 0;
mockCalculateForUser("user2", null, false);      // never scored
mockCalculateForUser("user3", existingDue, false);
assert("AI called for never-scored user", aiCallCount >= 1);
assert("AI called for due user",          aiCallCount >= 2);

// ─── T5: Notification sent only on meaningful change ─────────────────────────

console.log("\n=== T5: Notification triggered only on ≥5 point change ===\n");

function shouldNotify(scoreChange) {
  return scoreChange !== null && Math.abs(scoreChange) >= 5;
}

assert("change = +10 → notify",   shouldNotify(10)   === true);
assert("change = -8  → notify",   shouldNotify(-8)   === true);
assert("change = +5  → notify",   shouldNotify(5)    === true);
assert("change = +4  → no notify",shouldNotify(4)    === false);
assert("change = -3  → no notify",shouldNotify(-3)   === false);
assert("change = 0   → no notify",shouldNotify(0)    === false);
assert("change = null → no notify",shouldNotify(null) === false);

// ─── T6: History recorded correctly ──────────────────────────────────────────

console.log("\n=== T6: History is stored correctly ===\n");

const existingWithHistory = {
  score: 200,
  rating: "Fair",
  calculatedAt: new Date("2026-01-01"),
  scoreChange: null,
  history: [{ score: 180, rating: "Poor", calculatedAt: new Date("2025-12-01"), scoreChange: null }],
};

const olderEntry = {
  score: existingWithHistory.score,
  rating: existingWithHistory.rating,
  calculatedAt: existingWithHistory.calculatedAt,
  scoreChange: null,
};

const newHistory = appendHistory(existingWithHistory, olderEntry);

assert("history has 2 entries after first append",   newHistory.length === 2);
assert("newest entry is first",                       newHistory[0].score === 200);
assert("oldest entry is last",                        newHistory[newHistory.length - 1].score === 180);

// ─── T7: History capped at 26 entries ────────────────────────────────────────

console.log("\n=== T7: History capped at 26 entries ===\n");

const bigHistory = Array.from({ length: 26 }, (_, i) => ({
  score: i * 10 + 100,
  rating: "Fair",
  calculatedAt: new Date(),
  scoreChange: i,
}));

const existingFull = { score: 360, history: bigHistory };
const anotherEntry = { score: 360, rating: "Great", calculatedAt: new Date(), scoreChange: 0 };

const cappedHistory = appendHistory(existingFull, anotherEntry, 26);
assert("history capped at 26",        cappedHistory.length === 26);
assert("newest entry is first after cap", cappedHistory[0].score === 360);

// ─── T8: AI result sanitization ──────────────────────────────────────────────

console.log("\n=== T8: AI result is sanitized correctly ===\n");

const rawValid = {
  score: 325.7,
  summary: "Your finances look healthy overall.",
  strengths: ["Consistent savings", "Low debt", "Emergency fund"],
  weaknesses: ["High dining spend", "No investments"],
  recommendations: ["Invest 10% monthly", "Cut dining by £50"],
};

const sanitised = sanitiseAiResult(rawValid);
assert("score is rounded integer",          sanitised.score === 326);
assert("score is clamped max 500",          sanitiseAiResult({ score: 9999 }).score === 500);
assert("score is clamped min 0",            sanitiseAiResult({ score: -100 }).score === 0);
assert("summary is string",                 typeof sanitised.summary === "string");
assert("strengths capped at 3",             sanitised.strengths.length === 3);
assert("weaknesses capped at 3",            sanitised.weaknesses.length <= 3);
assert("recommendations capped at 3",       sanitised.recommendations.length <= 3);

// ─── T9: Score change calculation ────────────────────────────────────────────

console.log("\n=== T9: Score change calculated correctly ===\n");

const prevScore = { score: 300 };
assert("increase: +50",    calcScoreChange(350, prevScore) === 50);
assert("decrease: -25",    calcScoreChange(275, prevScore) === -25);
assert("no change: 0",     calcScoreChange(300, prevScore) === 0);
assert("first score: null",calcScoreChange(300, null)      === null);

// ─── T10: Edge cases in sanitisation ─────────────────────────────────────────

console.log("\n=== T10: AI response edge cases ===\n");

const aiNoArrays = { score: 250, summary: "OK", strengths: null, weaknesses: undefined, recommendations: "text" };
const s10 = sanitiseAiResult(aiNoArrays);
assert("null strengths → empty array",       Array.isArray(s10.strengths) && s10.strengths.length === 0);
assert("undefined weaknesses → empty array", Array.isArray(s10.weaknesses) && s10.weaknesses.length === 0);
assert("string recommendations → empty array",Array.isArray(s10.recommendations) && s10.recommendations.length === 0);

const aiExtraItems = { score: 400, summary: "", strengths: ["a","b","c","d","e"], weaknesses: [], recommendations: ["x","y","z","w"] };
const s10b = sanitiseAiResult(aiExtraItems);
assert("strengths trimmed to 3",       s10b.strengths.length === 3);
assert("recommendations trimmed to 3", s10b.recommendations.length === 3);

const aiNaNScore = { score: "not-a-number", summary: "" };
assert("NaN score defaults to 0", sanitiseAiResult(aiNaNScore).score === 0);

const aiEmptySummary = { score: 200, summary: null };
assert("null summary becomes empty string", sanitiseAiResult(aiEmptySummary).summary === "");

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
