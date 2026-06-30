/**
 * Applies all SQL migration files to Neon in order.
 * Run: node scripts/apply-schema.mjs
 *
 * Reads DATABASE_URL from .env.local automatically.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// --- Load .env.local manually (no dotenv dep needed) ---
const envPath = resolve(root, ".env.local");
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
  console.error("❌  DATABASE_URL no está configurado en .env.local");
  process.exit(1);
}

// --- Build unpooled URL (migrations require direct connection, not pooler) ---
// Replace "-pooler.c-9." with ".c-9." and strip options param (set via SET command instead)
const migrationUrl = DATABASE_URL
  .replace(/-pooler(\.c-\d+\.)/, "$1")
  .replace(/[&?]options=[^&]*/, "");

// --- Import postgres (ES module) ---
const { default: postgres } = await import("postgres");
const sql = postgres(migrationUrl, {
  ssl: "require",
  max: 1,
  connection: { search_path: "finanzas" },
});

const FILES = [
  "sql/001_schema.sql",
  "sql/002_seed_companies.sql",
  "sql/003_seed_pnl_lines.sql",
  "sql/004_views.sql",
  "sql/005_functions.sql",
];

console.log("🚀  Aplicando schema a Neon...\n");

for (const file of FILES) {
  const path = resolve(root, file);
  if (!existsSync(path)) {
    console.warn(`⚠️   No encontrado: ${file} — omitiendo`);
    continue;
  }

  process.stdout.write(`   ${file} ... `);
  const content = readFileSync(path, "utf8");

  try {
    await sql.unsafe(content);
    console.log("✓");
  } catch (err) {
    console.log("✗");
    console.error(`\n❌  Error en ${file}:\n${err.message}\n`);
    await sql.end();
    process.exit(1);
  }
}

console.log("\n✅  Schema aplicado correctamente.");
console.log("   Verifica con:\n");
console.log('   SELECT name FROM finanzas.companies;');
console.log('   SELECT COUNT(*) FROM finanzas.pnl_lines;\n');

// Optional: run migration if fact_libro_diario exists
const hasMigration = existsSync(resolve(root, "sql/006_migration.sql"));
if (hasMigration) {
  console.log("ℹ️   Para migrar datos históricos de fact_libro_diario, ejecuta:");
  console.log("   node scripts/apply-schema.mjs --migrate\n");
}

if (process.argv.includes("--migrate")) {
  const migPath = resolve(root, "sql/006_migration.sql");
  process.stdout.write("   sql/006_migration.sql ... ");
  try {
    await sql.unsafe(readFileSync(migPath, "utf8"));
    console.log("✓");
  } catch (err) {
    console.log("✗");
    console.error(`\n❌  Error en migración:\n${err.message}\n`);
  }
}

await sql.end();
