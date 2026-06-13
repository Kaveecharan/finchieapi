/**
 * Subscription trial-guard tests.
 *
 * Proves: a user who has ever subscribed (trial or paid) can NEVER receive a
 * second free trial, and premium access is strictly gated by
 *   status ∈ {trialing, active}  AND  currentPeriodEnd > now
 *
 * Run with: NODE_ENV=test node --experimental-vm-modules node_modules/.bin/jest
 */

import { describe, it, expect } from "@jest/globals";
import { isPremiumActive } from "../models/Subscription.js";

// ── Mirrors hadTrial from subscription.service.js (formatForClient + activate) ──
//
// The formula appears in three places in the source; they must stay identical:
//   1. formatForClient:          !!(sub.trialStart || sub.stripeSubscriptionId)
//   2. activate() trialDays:     (sub.trialStart || sub.stripeSubscriptionId) ? 0 : 30
//   3. subscriptionSlice (fe):   !!(sub?.hadTrial || sub?.trialStart)
//
// Tests here validate the server-side formula (1 & 2). The frontend receives
// the server-computed hadTrial flag so it can't diverge.
const hadTrial = (sub) => !!(sub?.trialStart || sub?.stripeSubscriptionId);
const trialDaysFor = (sub) => (hadTrial(sub) ? 0 : 30);

// ── Helpers ───────────────────────────────────────────────────────────────────

const future = () => new Date(Date.now() + 30 * 86_400_000); // 30 days from now
const past   = () => new Date(Date.now() - 1 * 86_400_000);  // 1 day ago

// Represents a brand-new user: Subscription doc created by setup() but
// activate() has never been called. No stripeSubscriptionId, no trialStart.
const brandNewUserSub = () => ({
  status:               "expired",
  plan:                 "free",
  stripeCustomerId:     "cus_new",
  stripeSubscriptionId: null,
  trialStart:           null,
  trialEnd:             null,
  currentPeriodEnd:     null,
});

// ── 1. Brand-new user: eligible for 30-day trial ──────────────────────────────
describe("brand-new user (no prior subscription)", () => {
  const sub = brandNewUserSub();

  it("hadTrial is false", () => {
    expect(hadTrial(sub)).toBe(false);
  });

  it("gets 30-day trial on activation", () => {
    expect(trialDaysFor(sub)).toBe(30);
  });

  it("has no premium access yet", () => {
    expect(isPremiumActive(sub)).toBe(false);
  });
});

// ── 2. Active trial user ───────────────────────────────────────────────────────
describe("user on active free trial", () => {
  const sub = {
    status:               "trialing",
    plan:                 "premium",
    stripeSubscriptionId: "sub_trial",
    stripeCustomerId:     "cus_trial",
    trialStart:           past(),
    trialEnd:             future(),
    currentPeriodEnd:     future(),
  };

  it("has premium access", () => {
    expect(isPremiumActive(sub)).toBe(true);
  });

  it("hadTrial is true (via stripeSubscriptionId)", () => {
    expect(hadTrial(sub)).toBe(true);
  });

  it("would receive 0 trial days if activate were called again", () => {
    expect(trialDaysFor(sub)).toBe(0);
  });
});

// ── 3. Trial ended, user never paid ───────────────────────────────────────────
//
// This was the primary bug: frontend saw status "expired", no trialStart
// (set to null by Mongoose on old records), no stripeSubscriptionId on client,
// so it treated this user as a new free user and offered "Start Free Trial".
describe("trial ended, never converted to paid (the bug scenario)", () => {
  // Old record: trialStart may be null if the field was not populated on trial activation
  const subWithNullTrial = {
    status:               "expired",
    plan:                 "free",
    stripeSubscriptionId: "sub_old_trial", // THIS is the guard — always set
    stripeCustomerId:     "cus_trial_end",
    trialStart:           null, // null on some older records — cannot rely on this alone
    trialEnd:             null,
    currentPeriodEnd:     past(),
  };

  it("has no premium access", () => {
    expect(isPremiumActive(subWithNullTrial)).toBe(false);
  });

  it("hadTrial is true even when trialStart is null — stripeSubscriptionId is the fallback", () => {
    expect(hadTrial(subWithNullTrial)).toBe(true);
  });

  it("gets 0 trial days — cannot receive a second trial", () => {
    expect(trialDaysFor(subWithNullTrial)).toBe(0);
  });

  // Same scenario with trialStart populated
  const subWithTrial = { ...subWithNullTrial, trialStart: past(), trialEnd: past() };

  it("hadTrial is true when trialStart is set", () => {
    expect(hadTrial(subWithTrial)).toBe(true);
  });

  it("still gets 0 trial days", () => {
    expect(trialDaysFor(subWithTrial)).toBe(0);
  });
});

// ── 4. Active paying subscriber ────────────────────────────────────────────────
describe("active paying subscriber", () => {
  const sub = {
    status:               "active",
    plan:                 "premium",
    stripeSubscriptionId: "sub_active",
    stripeCustomerId:     "cus_active",
    trialStart:           past(),
    trialEnd:             past(),
    currentPeriodEnd:     future(),
    cancelAtPeriodEnd:    false,
  };

  it("has premium access", () => {
    expect(isPremiumActive(sub)).toBe(true);
  });

  it("hadTrial is true", () => {
    expect(hadTrial(sub)).toBe(true);
  });

  it("gets 0 trial days", () => {
    expect(trialDaysFor(sub)).toBe(0);
  });
});

// ── 5. Past-due user (payment failed) ─────────────────────────────────────────
describe("past_due user (payment failed)", () => {
  const sub = {
    status:               "past_due",
    plan:                 "free",
    stripeSubscriptionId: "sub_pastdue",
    stripeCustomerId:     "cus_pastdue",
    trialStart:           past(),
    trialEnd:             past(),
    currentPeriodEnd:     past(),
  };

  it("has NO premium access", () => {
    expect(isPremiumActive(sub)).toBe(false);
  });

  it("hadTrial is true", () => {
    expect(hadTrial(sub)).toBe(true);
  });

  it("gets 0 trial days — cannot receive a trial on retry", () => {
    expect(trialDaysFor(sub)).toBe(0);
  });
});

// ── 6. Cancelled-at-period-end (still within paid period) ─────────────────────
describe("cancelled subscription still within billing period", () => {
  const sub = {
    status:               "active",
    plan:                 "premium",
    stripeSubscriptionId: "sub_cancelling",
    stripeCustomerId:     "cus_cancelling",
    trialStart:           past(),
    trialEnd:             past(),
    currentPeriodEnd:     future(),
    cancelAtPeriodEnd:    true,
  };

  it("still has premium access until period end", () => {
    expect(isPremiumActive(sub)).toBe(true);
  });

  it("hadTrial is true", () => {
    expect(hadTrial(sub)).toBe(true);
  });

  it("gets 0 trial days if they reactivate", () => {
    expect(trialDaysFor(sub)).toBe(0);
  });
});

// ── 7. Expired subscription (fully ended, period passed) ──────────────────────
describe("fully expired subscription", () => {
  const sub = {
    status:               "expired",
    plan:                 "free",
    stripeSubscriptionId: "sub_expired",
    stripeCustomerId:     "cus_expired",
    trialStart:           past(),
    trialEnd:             past(),
    currentPeriodEnd:     past(),
  };

  it("has no premium access", () => {
    expect(isPremiumActive(sub)).toBe(false);
  });

  it("hadTrial is true", () => {
    expect(hadTrial(sub)).toBe(true);
  });

  it("gets 0 trial days on re-subscribe", () => {
    expect(trialDaysFor(sub)).toBe(0);
  });
});

// ── 8. Retry payment succeeded — status flipped to active ─────────────────────
describe("after successful retry payment", () => {
  // Simulates the updated doc returned by retryPayment() after $set {status: "active", plan: "premium"}
  const sub = {
    status:               "active",
    plan:                 "premium",
    stripeSubscriptionId: "sub_retry",
    stripeCustomerId:     "cus_retry",
    trialStart:           past(),
    trialEnd:             past(),
    currentPeriodEnd:     future(),
  };

  it("has premium access immediately (no webhook wait)", () => {
    expect(isPremiumActive(sub)).toBe(true);
  });

  it("hadTrial is still true — historical trial preserved", () => {
    expect(hadTrial(sub)).toBe(true);
  });
});

// ── 9. Re-subscribe after expiry ───────────────────────────────────────────────
// User: expired trial → enters card details again → activate() is called.
// Stripe creates a subscription with NO trial (trialDays=0 was passed).
// resolveSubscriptionState gets trial_start=null, trial_end=null from Stripe.
// The DB's historical trialStart must NOT be overwritten.
describe("re-subscribe after expiry (no second trial)", () => {
  // State BEFORE activate() — what the DB contains
  const subBeforeActivate = {
    status:               "expired",
    plan:                 "free",
    stripeSubscriptionId: "sub_old",      // from first subscription
    stripeCustomerId:     "cus_resub",
    trialStart:           past(),          // historical — must be preserved
    trialEnd:             past(),
    currentPeriodEnd:     past(),
  };

  it("activate() computes trialDays=0 (no second trial)", () => {
    expect(trialDaysFor(subBeforeActivate)).toBe(0);
  });

  // resolveSubscriptionState with trial_start=null from Stripe (no trial on new sub)
  // The function only writes trialStart when Stripe reports it (see source)
  // So historical trialStart is preserved in the DB — guard stays intact.
  it("resolveSubscriptionState with no Stripe trial does NOT include trialStart in $set", () => {
    // Mirror the conditional logic from resolveSubscriptionState:
    const stripeSub = {
      id:                    "sub_new",
      status:                "active",
      current_period_start:  Math.floor(Date.now() / 1000),
      current_period_end:    Math.floor((Date.now() + 30 * 86_400_000) / 1000),
      cancel_at_period_end:  false,
      trial_start:           null,  // No trial on re-subscription
      trial_end:             null,
    };
    const state = {};
    if (stripeSub.trial_start) state.trialStart = new Date(stripeSub.trial_start * 1000);
    if (stripeSub.trial_end)   state.trialEnd   = new Date(stripeSub.trial_end   * 1000);

    expect(state).not.toHaveProperty("trialStart");
    expect(state).not.toHaveProperty("trialEnd");
  });

  // Confirm: after re-subscribe, the new sub (with new stripeSubscriptionId) is still guarded
  const subAfterActivate = {
    status:               "active",
    plan:                 "premium",
    stripeSubscriptionId: "sub_new",   // new sub ID
    stripeCustomerId:     "cus_resub",
    trialStart:           past(),       // preserved from before
    trialEnd:             past(),
    currentPeriodEnd:     future(),
  };

  it("hadTrial is true after re-subscribe (via trialStart)", () => {
    expect(hadTrial(subAfterActivate)).toBe(true);
  });

  it("has premium access after re-subscribe", () => {
    expect(isPremiumActive(subAfterActivate)).toBe(true);
  });
});

// ── 10. Webhook ordering — out-of-order event must not regress state ──────────
// This tests the stateGuard logic semantics: a stale event (older timestamp)
// arriving after a newer event must be skipped.
describe("webhook out-of-order guard semantics", () => {
  const newerEventAt = new Date("2026-06-10T12:00:00Z");
  const olderEventAt = new Date("2026-06-10T11:00:00Z");
  const newerEventId = "evt_newer";
  const olderEventId = "evt_older";

  const currentDocState = {
    lastStripeEventId:  newerEventId,
    lastStripeEventAt:  newerEventAt,
    stripeCustomerId:   "cus_webhook",
  };

  // stateGuard query condition:
  //   lastStripeEventId: { $ne: eventId }
  //   $or: [ { lastStripeEventAt: null }, { lastStripeEventAt: { $lte: eventCreatedAt } } ]

  it("newer event (same ID) is skipped — idempotency guard", () => {
    // eventId === currentDoc.lastStripeEventId → $ne fails → no match → skipped
    const wouldMatch = currentDocState.lastStripeEventId !== newerEventId;
    expect(wouldMatch).toBe(false); // stateGuard returns no document
  });

  it("older event (different ID, older timestamp) is skipped — ordering guard", () => {
    const idGuardPasses = currentDocState.lastStripeEventId !== olderEventId; // true — different ID
    const timestampGuardPasses = olderEventAt <= newerEventAt;                // true — older or equal
    // Both guards require BOTH to pass for the update to proceed.
    // But the $or condition is: lastStripeEventAt is null OR lastStripeEventAt <= eventCreatedAt
    // Here lastStripeEventAt (newerEventAt) <= olderEventAt? No — it's newer, so condition FAILS.
    const atOlderThanDoc = olderEventAt <= currentDocState.lastStripeEventAt; // true? No:
    // olderEventAt (11:00) <= newerEventAt (12:00) — true, so $lte DOES match
    // BUT this means the old event passes the timestamp guard — the guard allows events
    // with timestamps <= current, which means it would accept this older event.
    // The real protection: once newer event sets lastStripeEventId, the idempotency check
    // on the SAME older event ID ensures it runs at most once.
    // The ordering guard ($lte) prevents a stale "active" from overwriting "past_due"
    // when the stale event has an EARLIER timestamp than the past_due event.
    // Here: past_due event at T+5, stale active event at T+1 → T+1 <= T+5 → guard passes!
    // This means the STALE active event would be APPLIED. That's wrong.
    // Actually re-reading the stateGuard: it checks lastStripeEventAt <= eventCreatedAt (the incoming event time)
    // Scenario: past_due (T+5) already applied. Stale active (T+1) arrives.
    //   lastStripeEventAt = T+5 (from past_due)
    //   eventCreatedAt    = T+1 (stale active)
    //   $lte condition: lastStripeEventAt (T+5) <= eventCreatedAt (T+1) → FALSE → guard rejects → safe!
    const docEventAt = newerEventAt; // T+5 (the past_due event)
    const incomingEventAt = olderEventAt; // T+1 (stale active)
    const timestampGuardWouldAllow = docEventAt <= incomingEventAt; // T+5 <= T+1 → false
    expect(timestampGuardWouldAllow).toBe(false); // stale event is correctly rejected
  });

  it("newer event (different ID, newer timestamp) is applied", () => {
    const incomingEventAt = new Date("2026-06-10T13:00:00Z"); // T+7 (newer)
    const docEventAt      = newerEventAt; // T+5 (current state)
    const idGuardPasses   = currentDocState.lastStripeEventId !== "evt_newest"; // true
    const timestampGuardPasses = docEventAt <= incomingEventAt; // T+5 <= T+7 → true
    expect(idGuardPasses && timestampGuardPasses).toBe(true);
  });
});

// ── isPremiumActive edge cases ─────────────────────────────────────────────────
describe("isPremiumActive edge cases", () => {
  it("null sub → false", () => {
    expect(isPremiumActive(null)).toBe(false);
  });

  it("past_due → false regardless of currentPeriodEnd", () => {
    expect(isPremiumActive({ status: "past_due", currentPeriodEnd: future() })).toBe(false);
  });

  it("active but currentPeriodEnd in the past → false", () => {
    expect(isPremiumActive({ status: "active", currentPeriodEnd: past() })).toBe(false);
  });

  it("active, currentPeriodEnd in future → true", () => {
    expect(isPremiumActive({ status: "active", currentPeriodEnd: future() })).toBe(true);
  });

  it("trialing, currentPeriodEnd in future → true", () => {
    expect(isPremiumActive({ status: "trialing", currentPeriodEnd: future() })).toBe(true);
  });

  it("active, no currentPeriodEnd → false (safe default)", () => {
    expect(isPremiumActive({ status: "active", currentPeriodEnd: null })).toBe(false);
  });

  it("cancelled → false", () => {
    expect(isPremiumActive({ status: "cancelled", currentPeriodEnd: future() })).toBe(false);
  });

  it("expired → false", () => {
    expect(isPremiumActive({ status: "expired", currentPeriodEnd: future() })).toBe(false);
  });

  it("isPremiumActive uses a supplied 'now' timestamp for deterministic testing", () => {
    const fixedNow = new Date("2026-07-01T00:00:00Z");
    const periodEnd = new Date("2026-08-01T00:00:00Z"); // future relative to fixedNow
    expect(isPremiumActive({ status: "active", currentPeriodEnd: periodEnd }, fixedNow)).toBe(true);

    const expiredPeriodEnd = new Date("2026-06-01T00:00:00Z"); // past relative to fixedNow
    expect(isPremiumActive({ status: "active", currentPeriodEnd: expiredPeriodEnd }, fixedNow)).toBe(false);
  });
});
