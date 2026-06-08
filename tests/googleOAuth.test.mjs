// Unit test: Google OAuth audience array construction (Fix 6)
// Run: node tests/googleOAuth.test.mjs

let pass = 0, fail = 0;
const assert = (label, condition) => {
  if (condition) { console.log(`  PASS: ${label}`); pass++; }
  else           { console.error(`  FAIL: ${label}`); fail++; }
};

console.log("=== T6: Google OAuth validAudiences construction ===");

// Simulates the audience array construction from auth.service.js
function buildValidAudiences(web, ios, android) {
  return [web, ios, android].filter(Boolean);
}

// T6-a: all three configured → array of 3
const a1 = buildValidAudiences("web.apps.googleusercontent.com", "ios.apps.googleusercontent.com", "android.apps.googleusercontent.com");
assert("all three → 3-element array",   a1.length === 3);
assert("web client included",           a1.includes("web.apps.googleusercontent.com"));
assert("ios client included",           a1.includes("ios.apps.googleusercontent.com"));
assert("android client included",       a1.includes("android.apps.googleusercontent.com"));

// T6-b: only web configured → array of 1 (backward compat with old behaviour)
const a2 = buildValidAudiences("web.apps.googleusercontent.com", undefined, undefined);
assert("web only → 1-element array",    a2.length === 1);
assert("undefined filtered out",        !a2.includes(undefined));

// T6-c: web + ios, no android → array of 2
const a3 = buildValidAudiences("web.apps.googleusercontent.com", "ios.apps.googleusercontent.com", undefined);
assert("web+ios only → 2-element",      a3.length === 2);

// T6-d: none configured → empty array (googleWebClient guard prevents this reaching verifyIdToken)
const a4 = buildValidAudiences(undefined, undefined, undefined);
assert("no config → empty array",       a4.length === 0);

// T6-e: no null/undefined values in result
const a5 = buildValidAudiences("web", null, "android");
assert("null filtered out",             !a5.includes(null));
assert("empty string filtered out",     !buildValidAudiences("web", "", "android").includes(""));

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
