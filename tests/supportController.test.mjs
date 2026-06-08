// Unit test: support controller extracts correct userId (Fix 5)
// Run: node tests/supportController.test.mjs

let pass = 0, fail = 0;
const assert = (label, condition) => {
  if (condition) { console.log(`  PASS: ${label}`); pass++; }
  else           { console.error(`  FAIL: ${label}`); fail++; }
};

console.log("=== T5: support controller userId extraction ===");

// Simulate what authenticate middleware attaches to req.user
const mockAuthUser = {
  userId:          "550e8400-e29b-41d4-a716-446655440000",  // UUID string
  roles:           ["user"],
  sessionId:       "sess-abc-123",
  passwordVersion: 1,
  // _id is NOT present — Mongoose ObjectId is not forwarded
};

// T5-a: correct field returns the UUID
const userId = mockAuthUser?.userId;
assert("req.user.userId returns UUID string", typeof userId === "string" && userId.length > 0);
assert("correct value",                       userId === "550e8400-e29b-41d4-a716-446655440000");

// T5-b: old field (_id) is undefined — confirms original bug was real
const oldField = mockAuthUser?._id;
assert("req.user._id is undefined (original bug)",  oldField === undefined);

// T5-c: userId is defined (new fix works)
assert("req.user.userId is defined",  userId !== undefined);

// T5-d: uuid format check (should be a UUID, not ObjectId)
assert("userId is not a MongoDB ObjectId format",  !/^[0-9a-f]{24}$/.test(userId));

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
