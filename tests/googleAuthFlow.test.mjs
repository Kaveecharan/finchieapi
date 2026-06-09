// Unit tests: Google OAuth account resolution routing logic
// Tests the decision tree inside googleLogin (which action: login / signup / reactivated)
// Run: node tests/googleAuthFlow.test.mjs

let pass = 0, fail = 0;
const assert = (label, condition) => {
  if (condition) { console.log(`  PASS: ${label}`); pass++; }
  else           { console.error(`  FAIL: ${label}`); fail++; }
};

// ─── Inline routing logic (mirrors auth.service.js googleLogin decision tree) ──
//
// Parameters mirror the repository calls the service makes:
//   repo.findByEmailWithSecrets(email)       → active user with secrets or null
//   repo.findByGoogleId(googleId)            → active user by Google ID or null
//   repo.findDeactivatedByGoogleId(googleId) → deactivated user or null
//   repo.createUser()                        → newly created user
//   repo.reactivate(userId)                  → resolves when done
//   repo.save(user)                          → resolves when done

async function resolveGoogleAccount(googleId, email, repo) {
  const existingByEmail = await repo.findByEmailWithSecrets(email);
  if (existingByEmail?.passwordHash) {
    throw Object.assign(new Error("An account already exists with this email"), { code: "CONFLICT" });
  }

  let user = await repo.findByGoogleId(googleId);
  let action;

  if (!user) {
    if (existingByEmail) {
      user = existingByEmail;
      user.googleId = googleId;
      if (!user.isEmailVerified) user.isEmailVerified = true;
      await repo.save(user);
      action = "login";
    } else {
      const deactivated = await repo.findDeactivatedByGoogleId(googleId);
      if (deactivated) {
        await repo.reactivate(deactivated.userId);
        user = deactivated;
        action = "reactivated";
      } else {
        user = await repo.createUser();
        action = "signup";
      }
    }
  } else {
    action = "login";
  }

  return { user, action };
}

// ─── Helper stubs ─────────────────────────────────────────────────────────────

const noop = async () => {};

function makeRepo({
  existingByEmail = null,
  byGoogleId = null,
  deactivatedByGoogleId = null,
  newUser = { userId: "new-1", email: "new@example.com" },
} = {}) {
  return {
    findByEmailWithSecrets: async () => existingByEmail,
    findByGoogleId:         async () => byGoogleId,
    findDeactivatedByGoogleId: async () => deactivatedByGoogleId,
    createUser:  async () => newUser,
    reactivate:  noop,
    save:        noop,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log("=== Google OAuth flow: account resolution ===\n");

// T1 — New Google user: no existing user by email or googleId → creates account
console.log("T1: new Google user creates account successfully");
{
  const repo = makeRepo({ newUser: { userId: "u-new", email: "alice@example.com" } });
  const result = await resolveGoogleAccount("google-alice", "alice@example.com", repo);
  assert("action is 'signup'",            result.action === "signup");
  assert("user is the new account",       result.user.userId === "u-new");
}

// T2 — Existing active Google user: already linked → log in
console.log("\nT2: existing active Google user logs in successfully");
{
  const activeUser = { userId: "u-active", googleId: "google-bob", email: "bob@example.com" };
  const repo = makeRepo({ byGoogleId: activeUser });
  const result = await resolveGoogleAccount("google-bob", "bob@example.com", repo);
  assert("action is 'login'",             result.action === "login");
  assert("user is the active account",    result.user.userId === "u-active");
}

// T3 — Deactivated Google user: within 30-day window → reactivate and log in
console.log("\nT3: existing deactivated Google user is reactivated and logged in");
{
  const deactivatedUser = { userId: "u-deact", googleId: "google-carol", email: "carol@example.com", status: "deactivated" };
  let reactivateCalled = false;
  const repo = {
    ...makeRepo({ deactivatedByGoogleId: deactivatedUser }),
    reactivate: async (userId) => { reactivateCalled = true; assert("reactivate called with correct userId", userId === "u-deact"); },
  };
  const result = await resolveGoogleAccount("google-carol", "carol@example.com", repo);
  assert("action is 'reactivated'",       result.action === "reactivated");
  assert("user is the deactivated account", result.user.userId === "u-deact");
  assert("reactivate was called",         reactivateCalled);
}

// T4 — Duplicate prevention: email already has a password account → conflict
console.log("\nT4: duplicate account creation is prevented for password account");
{
  const passwordUser = { userId: "u-pw", email: "dan@example.com", passwordHash: "$2a$hashed" };
  const repo = makeRepo({ existingByEmail: passwordUser });
  let threw = false;
  try {
    await resolveGoogleAccount("google-dan", "dan@example.com", repo);
  } catch (err) {
    threw = true;
    assert("throws CONFLICT error",       err.code === "CONFLICT");
  }
  assert("exception was thrown",          threw);
}

// T5 — Same Google ID cannot create multiple users: second call finds existing
console.log("\nT5: same Google account cannot create multiple users");
{
  const existingUser = { userId: "u-eve", googleId: "google-eve", email: "eve@example.com" };
  const repo = makeRepo({ byGoogleId: existingUser });
  const result1 = await resolveGoogleAccount("google-eve", "eve@example.com", repo);
  const result2 = await resolveGoogleAccount("google-eve", "eve@example.com", repo);
  assert("first call: action is 'login'",  result1.action === "login");
  assert("second call: action is 'login'", result2.action === "login");
  assert("both calls return same user",    result1.user.userId === result2.user.userId);
}

// T6 — Existing email linked to Google: oauthOnly account without googleId yet
console.log("\nT6: existing email account without googleId is linked on first Google login");
{
  const existingOauthUser = { userId: "u-frank", email: "frank@example.com", isEmailVerified: false };
  let saveCalled = false;
  const repo = {
    ...makeRepo({ existingByEmail: existingOauthUser }),
    save: async (user) => { saveCalled = true; assert("googleId linked on save", user.googleId === "google-frank"); },
  };
  const result = await resolveGoogleAccount("google-frank", "frank@example.com", repo);
  assert("action is 'login'",             result.action === "login");
  assert("user is the existing account",  result.user.userId === "u-frank");
  assert("email verified after linking",  result.user.isEmailVerified === true);
  assert("save was called",               saveCalled);
}

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
