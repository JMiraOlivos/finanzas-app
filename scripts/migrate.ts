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
  "020_ai_alerts.sql",
  "021_financial_comments_ai_status.sql",
  // PR 1: P&L Builder — tablas versionadas
  "022_pnl_structure_versions.sql",
  "023_pnl_lines_versioned.sql",
  "024_account_pnl_mappings_versioned.sql",
  "025_pnl_formula_components_versioned.sql",
  "026_pnl_structure_change_log.sql",
  "027_period_close_structure_version.sql",
  "028_pnl_structure_seed_current.sql",
  // PR 9: Preview de impacto — función SQL que replica pipeline dbt parametrizada por version
  "029_fn_pnl_ytd_for_structure_version.sql",
  // PR 11: Agrega p_company_ids e is_bold/is_highlighted a la función
  "030_fn_pnl_ytd_for_structure_version_v2.sql",
  // Fix: unique indexes must scope to is_active=true to allow deactivate+insert upsert pattern
  "031_fix_apmv_unique_indexes.sql",
  // Fix: fn_pnl_ytd / fn_pnl_lmonth_ytd / fn_pnl_monthly now read from pnl_lines_versioned
  // so new lines added to a published structure version appear in EERR immediately after dbt run
  "032_fn_pnl_ytd_use_versioned_lines.sql",
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
