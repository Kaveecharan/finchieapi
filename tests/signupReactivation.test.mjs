// Unit tests: email/password signup flow with deactivated accounts
// Tests the decision tree added to initiateSignup and verifySignupCode
// Run: node tests/signupReactivation.test.mjs

let pass = 0, fail = 0;
const assert = (label, condition) => {
  if (condition) { console.log(`  PASS: ${label}`); pass++; }
  else           { console.error(`  FAIL: ${label}`); fail++; }
};

// ─── Inline routing logic — mirrors initiateSignup decision tree ──────────────

async function initiateSignupRouting(email, repo) {
  const existing = await repo.findByEmail(email);

  if (existing?.isEmailVerified) {
    if (existing.oauthOnly) throw Object.assign(new Error("sign in with Google"), { code: "CONFLICT_GOOGLE" });
    throw Object.assign(new Error("Email already registered"), { code: "CONFLICT" });
  }

  if (existing) {
    if (existing.oauthOnly) throw Object.assign(new Error("sign in with Google"), { code: "CONFLICT_GOOGLE" });
    await repo.updateCredentials(existing);
    return "updated_existing";
  }

  // Active lookup null — check deactivated before creating
  const deactivated = await repo.findDeactivatedByEmailWithSecrets(email);
  if (deactivated) {
    if (deactivated.oauthOnly) {
      throw Object.assign(
        new Error("This email was registered with Google Sign-In. Please sign in with Google to reactivate your account."),
        { code: "CONFLICT_GOOGLE_DEACTIVATED" }
      );
    }
    await repo.updateCredentials(deactivated);
    return "reactivation_initiated";
  }

  await repo.createUser(email);
  return "new_user";
}

// ─── Inline routing logic — mirrors verifySignupCode deactivated path ─────────

async function verifySignupCodeRouting(email, repo) {
  let user = await repo.findByEmailWithSecrets(email);
  let wasDeactivated = false;

  if (!user) {
    const deactivated = await repo.findDeactivatedByEmailWithSecrets(email);
    if (deactivated && !deactivated.isEmailVerified && deactivated.verificationCodeHash) {
      user = deactivated;
      wasDeactivated = true;
    }
  }

  if (!user || user.isEmailVerified) throw new Error("Invalid or expired verification code");

  await repo.markEmailVerified(user._id);
  if (wasDeactivated) await repo.reactivate(user.userId);

  return { wasDeactivated };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const noop = async () => {};

function makeSignupRepo({ active = null, deactivated = null } = {}) {
  let created = false;
  let updated = null;
  return {
    findByEmail: async () => active,
    findDeactivatedByEmailWithSecrets: async () => deactivated,
    createUser: async (email) => { created = true; return { email }; },
    updateCredentials: async (u) => { updated = u; },
    _created: () => created,
    _updated: () => updated,
  };
}

function makeVerifyRepo({ active = null, deactivated = null } = {}) {
  let reactivateCalled = false;
  let verifiedId = null;
  return {
    findByEmailWithSecrets: async () => active,
    findDeactivatedByEmailWithSecrets: async () => deactivated,
    markEmailVerified: async (_id) => { verifiedId = _id; return { userId: "u1" }; },
    reactivate: async (userId) => { reactivateCalled = true; },
    _reactivateCalled: () => reactivateCalled,
    _verifiedId: () => verifiedId,
  };
}

// ─── initiateSignup tests ─────────────────────────────────────────────────────

console.log("=== initiateSignup: deactivated account handling ===\n");

// T1 — Deactivated oauthOnly user tries email/password signup → block with clear message
console.log("T1: deactivated Google-only account blocked from email/password signup");
{
  const repo = makeSignupRepo({ deactivated: { oauthOnly: true, isEmailVerified: true } });
  let threw = false, code = null;
  try {
    await initiateSignupRouting("alice@example.com", repo);
  } catch (err) {
    threw = true;
    code = err.code;
  }
  assert("throws a conflict error",             threw);
  assert("error code is CONFLICT_GOOGLE_DEACTIVATED", code === "CONFLICT_GOOGLE_DEACTIVATED");
  assert("no new user created",                 !repo._created());
}

// T2 — Deactivated email/password user re-signs-up → update credentials, no new user
console.log("\nT2: deactivated email/password account updated, no duplicate created");
{
  const deactivated = { userId: "u-deact", oauthOnly: false, isEmailVerified: true };
  const repo = makeSignupRepo({ deactivated });
  const outcome = await initiateSignupRouting("bob@example.com", repo);
  assert("returns reactivation_initiated",      outcome === "reactivation_initiated");
  assert("no new user created",                 !repo._created());
  assert("existing record updated",             repo._updated() === deactivated);
}

// T3 — No user at all → new account created normally
console.log("\nT3: no existing user → creates new account");
{
  const repo = makeSignupRepo(); // no active, no deactivated
  const outcome = await initiateSignupRouting("carol@example.com", repo);
  assert("returns new_user",                    outcome === "new_user");
  assert("createUser was called",               repo._created());
}

// T4 — Active verified user → conflict (existing behavior preserved)
console.log("\nT4: active verified user → conflict error");
{
  const repo = makeSignupRepo({ active: { isEmailVerified: true, oauthOnly: false } });
  let threw = false, code = null;
  try {
    await initiateSignupRouting("dan@example.com", repo);
  } catch (err) {
    threw = true;
    code = err.code;
  }
  assert("throws conflict",                     threw);
  assert("code is CONFLICT",                    code === "CONFLICT");
}

// ─── verifySignupCode tests ───────────────────────────────────────────────────

console.log("\n=== verifySignupCode: deactivated account re-verification ===\n");

// T5 — Deactivated user with pending verification code → verify + reactivate
console.log("T5: deactivated account verified and reactivated");
{
  const deactivated = {
    _id: "mongo-1",
    userId: "u-deact",
    isEmailVerified: false,
    verificationCodeHash: "hash123",
  };
  const repo = makeVerifyRepo({ deactivated });
  const result = await verifySignupCodeRouting("eve@example.com", repo);
  assert("wasDeactivated is true",              result.wasDeactivated);
  assert("markEmailVerified called",            repo._verifiedId() === "mongo-1");
  assert("reactivate called",                   repo._reactivateCalled());
}

// T6 — Active unverified user → standard path, no reactivate called
console.log("\nT6: active unverified user follows standard path without reactivation");
{
  const active = {
    _id: "mongo-2",
    userId: "u-active",
    isEmailVerified: false,
    verificationCodeHash: "hash456",
  };
  const repo = makeVerifyRepo({ active });
  const result = await verifySignupCodeRouting("frank@example.com", repo);
  assert("wasDeactivated is false",             !result.wasDeactivated);
  assert("markEmailVerified called",            repo._verifiedId() === "mongo-2");
  assert("reactivate NOT called",               !repo._reactivateCalled());
}

// T7 — Deactivated user but isEmailVerified is still true (no pending re-signup) → error
console.log("\nT7: deactivated user with no pending re-signup code is rejected");
{
  const deactivated = {
    _id: "mongo-3",
    userId: "u-deact2",
    isEmailVerified: true,       // not reset by initiateSignup → not in re-signup flow
    verificationCodeHash: "hash",
  };
  const repo = makeVerifyRepo({ deactivated });
  let threw = false;
  try {
    await verifySignupCodeRouting("grace@example.com", repo);
  } catch (err) {
    threw = true;
    assert("error is verification failure",     err.message === "Invalid or expired verification code");
  }
  assert("throws error",                        threw);
}

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
