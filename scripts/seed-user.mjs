/**
 * Seed sample finance data for a user account and trigger score calculation.
 * Run from be/ directory:  node scripts/seed-user.mjs
 * Delete this file after use.
 */

const BASE   = "https://finchieapi.onrender.com";
const EMAIL  = "kaveecharan26@gmail.com";
const PASS   = "Kvmachchi1426#";

const api = async (method, path, body, token) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "x-platform": "android",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
};

const d = (y, m, day) => `${y}-${String(m).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

// ── 1. login ───────────────────────────────────────────────────────────────────
console.log("Logging in…");
const { accessToken, user } = await api("POST", "/auth/login", { email: EMAIL, password: PASS });
const token  = accessToken;
const userId = user.userId;
console.log(`  Logged in as ${user.firstName} (${userId})`);

// ── 2. fetch categories ────────────────────────────────────────────────────────
console.log("Fetching categories…");
const { data: cats } = await api("GET", "/categories", null, token);

const expCat = (name) => {
  const c = cats.find(c => c.type === "expense" && c.name === name);
  if (!c) throw new Error(`Expense category not found: "${name}"`);
  return { _id: c._id, name: c.name };
};
const incCat = (name) => {
  const c = cats.find(c => c.type === "income" && c.name === name);
  if (!c) throw new Error(`Income category not found: "${name}"`);
  return { _id: c._id, name: c.name };
};

console.log(`  ${cats.filter(c=>c.type==="expense").length} expense cats, ${cats.filter(c=>c.type==="income").length} income cats`);

// ── 3. build sample data using actual account categories ──────────────────────
// Income profile: Tesco (part-time ~£1100/mo) + Amazon Flex (~£350/mo)
// Expense profile: ~£1100/mo → savings rate ~31%

const expenses = [
  // ── April 2026 ───────────────────────────────────────────────────────────────
  { date: d(2026,4,1),  amount: 52.30,  itemName: "Weekly grocery run",       category: expCat("Grocery")    },
  { date: d(2026,4,2),  amount: 3.80,   itemName: "Morning coffee",           category: expCat("Breakfast")  },
  { date: d(2026,4,3),  amount: 8.50,   itemName: "Meal deal",                category: expCat("Lunch")      },
  { date: d(2026,4,4),  amount: 38.00,  itemName: "Bus weekly pass",          category: expCat("Transport")  },
  { date: d(2026,4,5),  amount: 85.00,  itemName: "Electricity",              category: expCat("Bills")      },
  { date: d(2026,4,6),  amount: 35.00,  itemName: "Mobile bill",              category: expCat("Bills")      },
  { date: d(2026,4,7),  amount: 4.20,   itemName: "Orange juice and snack",   category: expCat("Drink")      },
  { date: d(2026,4,8),  amount: 44.60,  itemName: "Grocery shop",             category: expCat("Grocery")    },
  { date: d(2026,4,9),  amount: 6.50,   itemName: "Cashews and almonds",      category: expCat("Nuts")       },
  { date: d(2026,4,10), amount: 12.00,  itemName: "Pharmacy paracetamol",     category: expCat("Medicine")   },
  { date: d(2026,4,11), amount: 8.90,   itemName: "Lunch at work",            category: expCat("Lunch")      },
  { date: d(2026,4,12), amount: 22.00,  itemName: "Salmon and prawns",        category: expCat("Meat & Seafood") },
  { date: d(2026,4,13), amount: 5.50,   itemName: "Crisps and chocolate",     category: expCat("Snacks")     },
  { date: d(2026,4,14), amount: 15.00,  itemName: "Haircut",                  category: expCat("Grooming")   },
  { date: d(2026,4,15), amount: 48.20,  itemName: "Grocery shop",             category: expCat("Grocery")    },
  { date: d(2026,4,16), amount: 25.00,  itemName: "Textbook",                 category: expCat("Studies")    },
  { date: d(2026,4,17), amount: 7.80,   itemName: "Coffee and bagel",         category: expCat("Breakfast")  },
  { date: d(2026,4,18), amount: 18.50,  itemName: "Chicken and beef mince",   category: expCat("Meat & Seafood") },
  { date: d(2026,4,19), amount: 3.50,   itemName: "Bottled water",            category: expCat("Water")      },
  { date: d(2026,4,20), amount: 14.00,  itemName: "Bus fares",                category: expCat("Transport")  },
  { date: d(2026,4,21), amount: 46.90,  itemName: "Weekly groceries",         category: expCat("Grocery")    },
  { date: d(2026,4,22), amount: 60.00,  itemName: "Internet and TV",          category: expCat("Bills")      },
  { date: d(2026,4,23), amount: 8.00,   itemName: "Lunch meal deal",          category: expCat("Lunch")      },
  { date: d(2026,4,24), amount: 35.00,  itemName: "Cleaning supplies",        category: expCat("Household")  },
  { date: d(2026,4,25), amount: 4.90,   itemName: "Apple and banana",         category: expCat("Fruits")     },
  { date: d(2026,4,26), amount: 9.00,   itemName: "Snacks for work",          category: expCat("Snacks")     },
  { date: d(2026,4,27), amount: 50.00,  itemName: "Grocery shop",             category: expCat("Grocery")    },
  { date: d(2026,4,28), amount: 5.00,   itemName: "Sparkling water",          category: expCat("Water")      },
  { date: d(2026,4,29), amount: 22.00,  itemName: "Shower gel and deodorant", category: expCat("Grooming")   },
  { date: d(2026,4,30), amount: 7.50,   itemName: "Evening snacks",           category: expCat("Snacks")     },

  // ── May 2026 ─────────────────────────────────────────────────────────────────
  { date: d(2026,5,1),  amount: 54.10,  itemName: "Grocery shop",             category: expCat("Grocery")    },
  { date: d(2026,5,2),  amount: 4.00,   itemName: "Morning coffee",           category: expCat("Breakfast")  },
  { date: d(2026,5,3),  amount: 38.00,  itemName: "Weekly bus pass",          category: expCat("Transport")  },
  { date: d(2026,5,4),  amount: 88.00,  itemName: "Electricity bill",         category: expCat("Bills")      },
  { date: d(2026,5,5),  amount: 35.00,  itemName: "Mobile bill",              category: expCat("Bills")      },
  { date: d(2026,5,6),  amount: 9.50,   itemName: "Lunch sandwich",           category: expCat("Lunch")      },
  { date: d(2026,5,7),  amount: 19.00,  itemName: "Cod fillet and tuna",      category: expCat("Meat & Seafood") },
  { date: d(2026,5,8),  amount: 47.30,  itemName: "Weekend groceries",        category: expCat("Grocery")    },
  { date: d(2026,5,9),  amount: 6.00,   itemName: "Mixed nuts",               category: expCat("Nuts")       },
  { date: d(2026,5,10), amount: 5.20,   itemName: "Orange and apple",         category: expCat("Fruits")     },
  { date: d(2026,5,11), amount: 8.90,   itemName: "Lunch at work",            category: expCat("Lunch")      },
  { date: d(2026,5,12), amount: 15.00,  itemName: "Ibuprofen and vitamins",   category: expCat("Medicine")   },
  { date: d(2026,5,13), amount: 5.00,   itemName: "Snack bar",                category: expCat("Snacks")     },
  { date: d(2026,5,14), amount: 14.00,  itemName: "Bus fares",                category: expCat("Transport")  },
  { date: d(2026,5,15), amount: 49.80,  itemName: "Grocery shop",             category: expCat("Grocery")    },
  { date: d(2026,5,16), amount: 60.00,  itemName: "Internet and TV",          category: expCat("Bills")      },
  { date: d(2026,5,17), amount: 30.00,  itemName: "Kitchen items",            category: expCat("Household")  },
  { date: d(2026,5,18), amount: 4.50,   itemName: "Ribena and water",         category: expCat("Drink")      },
  { date: d(2026,5,19), amount: 8.00,   itemName: "Lunch meal deal",          category: expCat("Lunch")      },
  { date: d(2026,5,20), amount: 21.00,  itemName: "Chicken thighs and steak", category: expCat("Meat & Seafood") },
  { date: d(2026,5,21), amount: 45.60,  itemName: "Grocery shop",             category: expCat("Grocery")    },
  { date: d(2026,5,22), amount: 18.00,  itemName: "Shampoo and body wash",    category: expCat("Grooming")   },
  { date: d(2026,5,23), amount: 3.50,   itemName: "Bottled water",            category: expCat("Water")      },
  { date: d(2026,5,24), amount: 7.90,   itemName: "Crisps and biscuits",      category: expCat("Snacks")     },
  { date: d(2026,5,25), amount: 38.00,  itemName: "Bus pass",                 category: expCat("Transport")  },
  { date: d(2026,5,26), amount: 6.50,   itemName: "Walnuts",                  category: expCat("Nuts")       },
  { date: d(2026,5,27), amount: 52.00,  itemName: "Weekend grocery shop",     category: expCat("Grocery")    },
  { date: d(2026,5,28), amount: 28.00,  itemName: "Course books",             category: expCat("Studies")    },
  { date: d(2026,5,29), amount: 9.50,   itemName: "Breakfast pastry",         category: expCat("Breakfast")  },
  { date: d(2026,5,30), amount: 4.00,   itemName: "Grapes and strawberries",  category: expCat("Fruits")     },
  { date: d(2026,5,31), amount: 8.50,   itemName: "Snacks for commute",       category: expCat("Snacks")     },

  // ── June 2026 ─────────────────────────────────────────────────────────────────
  { date: d(2026,6,1),  amount: 51.40,  itemName: "Grocery shop",             category: expCat("Grocery")    },
  { date: d(2026,6,2),  amount: 3.80,   itemName: "Morning coffee",           category: expCat("Breakfast")  },
  { date: d(2026,6,3),  amount: 38.00,  itemName: "Bus weekly pass",          category: expCat("Transport")  },
  { date: d(2026,6,4),  amount: 85.00,  itemName: "Electricity bill",         category: expCat("Bills")      },
  { date: d(2026,6,5),  amount: 35.00,  itemName: "Mobile bill",              category: expCat("Bills")      },
  { date: d(2026,6,6),  amount: 8.50,   itemName: "Lunch sandwich",           category: expCat("Lunch")      },
  { date: d(2026,6,7),  amount: 47.80,  itemName: "Weekend groceries",        category: expCat("Grocery")    },
  { date: d(2026,6,8),  amount: 20.00,  itemName: "Salmon and mackerel",      category: expCat("Meat & Seafood") },
  { date: d(2026,6,9),  amount: 5.00,   itemName: "Mixed nuts",               category: expCat("Nuts")       },
  { date: d(2026,6,10), amount: 4.50,   itemName: "Fruits",                   category: expCat("Fruits")     },
  { date: d(2026,6,11), amount: 14.00,  itemName: "Bus fares",                category: expCat("Transport")  },
  { date: d(2026,6,12), amount: 9.00,   itemName: "Lunch at work",            category: expCat("Lunch")      },
  { date: d(2026,6,13), amount: 46.20,  itemName: "Grocery shop",             category: expCat("Grocery")    },
  { date: d(2026,6,14), amount: 12.00,  itemName: "Vitamins",                 category: expCat("Medicine")   },
  { date: d(2026,6,15), amount: 60.00,  itemName: "Internet and TV",          category: expCat("Bills")      },
  { date: d(2026,6,16), amount: 6.00,   itemName: "Snacks",                   category: expCat("Snacks")     },
  { date: d(2026,6,17), amount: 16.00,  itemName: "Haircut",                  category: expCat("Grooming")   },
  { date: d(2026,6,18), amount: 4.20,   itemName: "Juice",                    category: expCat("Drink")      },
  { date: d(2026,6,19), amount: 50.00,  itemName: "Grocery shop",             category: expCat("Grocery")    },
  { date: d(2026,6,20), amount: 3.50,   itemName: "Bottled water",            category: expCat("Water")      },
  { date: d(2026,6,21), amount: 38.00,  itemName: "Bus pass",                 category: expCat("Transport")  },
  { date: d(2026,6,22), amount: 7.50,   itemName: "Breakfast at cafe",        category: expCat("Breakfast")  },
  { date: d(2026,6,23), amount: 22.00,  itemName: "Beef mince and chicken",   category: expCat("Meat & Seafood") },
  { date: d(2026,6,24), amount: 48.90,  itemName: "Weekend grocery run",      category: expCat("Grocery")    },
  { date: d(2026,6,25), amount: 25.00,  itemName: "Stationery",               category: expCat("Studies")    },
  { date: d(2026,6,26), amount: 5.80,   itemName: "Snacks",                   category: expCat("Snacks")     },
  { date: d(2026,6,27), amount: 28.00,  itemName: "Household cleaning",       category: expCat("Household")  },
  { date: d(2026,6,28), amount: 8.90,   itemName: "Lunch meal deal",          category: expCat("Lunch")      },
];

const incomes = [
  { date: d(2026,4,5),  amount: 1120, type: "Salary",     whose: "Tesco",        category: incCat("Tesco")       },
  { date: d(2026,4,12), amount: 180,  type: "Side Income", whose: "Amazon Flex", category: incCat("Amazon Flex") },
  { date: d(2026,4,19), amount: 160,  type: "Side Income", whose: "Amazon Flex", category: incCat("Amazon Flex") },
  { date: d(2026,5,5),  amount: 1120, type: "Salary",     whose: "Tesco",        category: incCat("Tesco")       },
  { date: d(2026,5,10), amount: 210,  type: "Side Income", whose: "Amazon Flex", category: incCat("Amazon Flex") },
  { date: d(2026,5,18), amount: 190,  type: "Side Income", whose: "Amazon Flex", category: incCat("Amazon Flex") },
  { date: d(2026,6,5),  amount: 1120, type: "Salary",     whose: "Tesco",        category: incCat("Tesco")       },
  { date: d(2026,6,14), amount: 220,  type: "Side Income", whose: "Amazon Flex", category: incCat("Amazon Flex") },
];

// ── 4. create incomes FIRST (builds balance so expenses don't get rejected) ────
console.log(`\nCreating ${incomes.length} income records first…`);
let incOk = 0, incFail = 0;
for (const i of incomes) {
  try {
    await api("POST", "/incomes", i, token);
    incOk++;
    process.stdout.write(".");
  } catch (err) {
    incFail++;
    process.stdout.write("x");
    console.warn(`\n  SKIP ${i.date} ${i.type}: ${err.message}`);
  }
}
console.log(`\n  Created: ${incOk}, Failed: ${incFail}`);

// ── 5. create expenses ─────────────────────────────────────────────────────────
console.log(`Creating ${expenses.length} expenses…`);
let expOk = 0, expFail = 0;
for (const e of expenses) {
  try {
    await api("POST", "/expenses", e, token);
    expOk++;
    process.stdout.write(".");
  } catch (err) {
    expFail++;
    process.stdout.write("x");
    console.warn(`\n  SKIP ${e.date} ${e.itemName}: ${err.message}`);
  }
}
console.log(`\n  Created: ${expOk}, Failed: ${expFail}`);

// ── 6. trigger finance score calculation ──────────────────────────────────────
console.log("\nTriggering finance score calculation…");
try {
  const result = await api("POST", "/finance-score/calculate", {}, token);
  const s = result.data;
  console.log(`  Score: ${s.score}/500  (${s.saved?.rating ?? ""})`);
  console.log(`\n  Done! Open the Finance Score screen in the app.`);
} catch (err) {
  console.warn(`  Score trigger failed: ${err.message}`);
  console.log("  → Deploy the backend, then run:  node scripts/trigger-score.mjs");
}
