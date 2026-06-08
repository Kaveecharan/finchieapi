// Unit test for push-token cap logic (Fix 4)
// Simulates the MongoDB aggregation pipeline logic in plain JS.
// Run: node tests/pushToken.test.mjs

let pass = 0, fail = 0;
const assert = (label, condition) => {
  if (condition) { console.log(`  PASS: ${label}`); pass++; }
  else           { console.error(`  FAIL: ${label}`); fail++; }
};

// Mirrors the pipeline logic:
//   $setUnion([existing, [newToken]])   → deduplicate
//   $slice(result, -5)                 → keep last 5
function simulatePushTokenUpdate(existing, newToken) {
  const merged = [...new Set([...(existing ?? []), newToken])];
  return merged.slice(-5); // $slice: -5 keeps last 5
}

console.log("=== T4: push token cap logic ===");

// T4-a: first token on empty array
const r1 = simulatePushTokenUpdate([], "ExpoToken[abc]");
assert("first token stored",          r1.length === 1 && r1[0] === "ExpoToken[abc]");

// T4-b: duplicate token not added
const r2 = simulatePushTokenUpdate(["ExpoToken[abc]"], "ExpoToken[abc]");
assert("duplicate not added",         r2.length === 1);

// T4-c: new token added alongside existing
const r3 = simulatePushTokenUpdate(["ExpoToken[abc]"], "ExpoToken[xyz]");
assert("new token added",             r3.length === 2 && r3.includes("ExpoToken[xyz]"));

// T4-d: cap enforced at exactly 5 when going from 5→6
const existing5 = ["t1", "t2", "t3", "t4", "t5"];
const r4 = simulatePushTokenUpdate(existing5, "t6");
assert("cap at 5 (5→6)",             r4.length === 5);
assert("newest token retained",       r4.includes("t6"));
assert("oldest token evicted",        !r4.includes("t1"));

// T4-e: cap enforced at 5 when starting from 10 (simulating pre-fix data)
const existing10 = ["t1","t2","t3","t4","t5","t6","t7","t8","t9","t10"];
const r5 = simulatePushTokenUpdate(existing10, "t11");
assert("10-token doc capped to 5",    r5.length === 5);
assert("t11 retained after cap",      r5.includes("t11"));

// T4-f: null/undefined existing treated as empty
const r6 = simulatePushTokenUpdate(null, "ExpoToken[new]");
assert("null existing handled",       r6.length === 1 && r6[0] === "ExpoToken[new]");

// T4-g: existing duplicate in large list still capped
const existing4dup = ["t1","t2","t3","t4"];
const r7 = simulatePushTokenUpdate(existing4dup, "t2"); // duplicate
assert("dup in 4-item list stays 4",  r7.length === 4);

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
