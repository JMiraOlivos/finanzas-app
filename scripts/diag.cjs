const postgres = require('../node_modules/postgres');
const fs = require('fs');

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const eq = line.indexOf('=');
  if (eq > 0) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
}

const url = process.env.DATABASE_URL
  .replace(/-pooler(\.c-\d+\.)/, '$1')
  .replace(/[&?]options=[^&]*/g, '');

const sql = postgres(url, { ssl: 'require', max: 1, connection: { search_path: 'finanzas' } });

async function main() {
  const dist    = await sql`SELECT is_pnl, COUNT(*) AS n FROM finanzas.journal_entries GROUP BY is_pnl`;
  const sample  = await sql`SELECT account_code, account_name, is_pnl FROM finanzas.journal_entries LIMIT 8`;
  const unmapped = await sql`SELECT COUNT(*) AS n FROM finanzas.v_unmapped_pnl_accounts`;
  console.log('is_pnl distribution:', JSON.stringify(dist));
  console.log('sample accounts:',     JSON.stringify(sample));
  console.log('unmapped pnl accounts:', JSON.stringify(unmapped));
  await sql.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
