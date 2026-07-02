/**
 * Applies pending SQL migrations against Neon.
 * Run with: npx tsx scripts/migrate.ts
 * Requires DATABASE_URL in .env.local (no extra dependencies needed).
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

// Load .env.local without dotenv dependency (same pattern as create-admin.ts)
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../.env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL not found in .env.local");
  process.exit(1);
}

// Use direct connection (not pooler) for DDL statements
const directUrl = DATABASE_URL
  .replace(/-pooler(\.c-\d+\.)/, "$1")
  .replace(/[&?]options=[^&]*/g, "");

const sql = postgres(directUrl, {
  ssl: "require",
  max: 1,
  connect_timeout: 15,
  connection: { search_path: "finanzas" },
});

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../sql");

const MIGRATION_FILES = [
  "018_ai_analysis_runs.sql",
];

async function run() {
  console.log("🔌  Connecting to Neon…");
  for (const file of MIGRATION_FILES) {
    const filePath = resolve(MIGRATIONS_DIR, file);
    if (!existsSync(filePath)) {
      console.warn(`⚠️   ${file} not found, skipping.`);
      continue;
    }
    const content = readFileSync(filePath, "utf-8");
    console.log(`▶   Running ${file}…`);
    try {
      await sql.unsafe(content);
      console.log(`✅  ${file} applied.`);
    } catch (err) {
      console.error(`❌  ${file} failed: ${(err as Error).message}`);
      process.exit(1);
    }
  }
  console.log("✅  All migrations complete.");
  await sql.end();
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
