/**
 * One-time script to promote an existing user to superAdmin.
 * Usage:  node scripts/make-admin.js <email>
 * Example: node scripts/make-admin.js kaveecharan26@gmail.com
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

// Load .env manually — no dotenv dependency needed
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env");
try {
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch {
  console.error("Could not read .env file. Make sure you run this from the be/ directory.");
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/make-admin.js <email>");
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI not found in .env");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const result = await mongoose.connection.db
  .collection("users")
  .findOneAndUpdate(
    { email: email.toLowerCase().trim() },
    { $addToSet: { roles: "superAdmin" } },
    { returnDocument: "after" }
  );

if (!result) {
  console.error(`No user found with email: ${email}`);
  await mongoose.disconnect();
  process.exit(1);
}

console.log(`Done. ${result.email} now has roles: [${result.roles.join(", ")}]`);
await mongoose.disconnect();
