// Unit test for queryBuilder regex escaping (ReDoS fix)
// Run: node tests/queryBuilder.test.mjs
import { buildExpenseFilter, buildIncomeFilter } from "../utils/queryBuilder.js";

let pass = 0, fail = 0;
const assert = (label, condition) => {
  if (condition) { console.log(`  PASS: ${label}`); pass++; }
  else           { console.error(`  FAIL: ${label}`); fail++; }
};

console.log("=== T3: queryBuilder search escaping (ReDoS fix) ===");

// T3-a: plain text passes through unchanged
const f1 = buildExpenseFilter("u1", { search: "coffee" });
assert("plain text search", f1.$or[0].itemName.$regex === "coffee");

// T3-b: catastrophic backtracking pattern is neutralised
const f2 = buildExpenseFilter("u1", { search: "(a+)+" });
assert("parens escaped",            f2.$or[0].itemName.$regex === "\\(a\\+\\)\\+");
assert("dangerous pattern gone",    f2.$or[0].itemName.$regex !== "(a+)+");

// T3-c: dot treated as literal
const f3 = buildExpenseFilter("u1", { search: "3.99" });
assert("dot escaped",               f3.$or[0].itemName.$regex === "3\\.99");

// T3-d: asterisk treated as literal
const f4 = buildExpenseFilter("u1", { search: "sale*" });
assert("asterisk escaped",          f4.$or[0].itemName.$regex === "sale\\*");

// T3-e: backslash escaped
const f5 = buildExpenseFilter("u1", { search: "a\\b" });
assert("backslash escaped",         f5.$or[0].itemName.$regex === "a\\\\b");

// T3-f: income filter also escaped
const f6 = buildIncomeFilter("u1", { search: "(test)+" });
assert("income filter escaped",     f6.$or[0].whose.$regex === "\\(test\\)\\+");

// T3-g: case-insensitive flag preserved
assert("$options still 'i'",        f2.$or[0].itemName.$options === "i");
assert("income $options still 'i'", f6.$or[0].whose.$options === "i");

// T3-h: no search = no filter.$or
const f7 = buildExpenseFilter("u1", {});
assert("no search → no $or",        f7.$or === undefined);

// T3-i: userId always scoped
assert("userId scoped correctly",   f1.userId === "u1");

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
