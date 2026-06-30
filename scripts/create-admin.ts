/**
 * Creates the first admin user in the database.
 * Run with: npx ts-node scripts/create-admin.ts
 * or:       npx tsx scripts/create-admin.ts
 *
 * Requires DATABASE_URL in environment (or .env.local).
 */
import { createHash } from "crypto";
import postgres from "postgres";
import * as readline from "readline";

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

async function hashPassword(password: string): Promise<string> {
  // Simple SHA-256 for script use; replace with bcrypt in prod if desired.
  // For full bcrypt, install and use: import bcrypt from "bcryptjs"; return bcrypt.hash(password, 12);
  const { default: bcrypt } = await import("bcryptjs");
  return bcrypt.hash(password, 12);
}

async function main() {
  // Load .env.local without dotenv dependency
  const { readFileSync, existsSync } = await import("fs");
  const envPath = new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
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

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set. Check .env.local");

  const migrationUrl = dbUrl
    .replace(/-pooler(\.c-\d+\.)/, "$1")
    .replace(/[&?]options=[^&]*/, "");
  const sql = postgres(migrationUrl, { ssl: "require" });

  const email    = await prompt("Email del admin: ");
  const name     = await prompt("Nombre completo: ");
  const password = await prompt("Contraseña: ");

  if (!email || !password) throw new Error("Email y contraseña son obligatorios.");

  const hash = await hashPassword(password);

  await sql`
    INSERT INTO finanzas.app_users (email, full_name, password_hash, role)
    VALUES (${email}, ${name}, ${hash}, 'admin')
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      full_name     = EXCLUDED.full_name,
      role          = 'admin',
      is_active     = TRUE
  `;

  console.log(`\n✓ Usuario admin creado: ${email}`);
  console.log("  Ahora puedes iniciar sesión en http://localhost:3000/login\n");

  await sql.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
