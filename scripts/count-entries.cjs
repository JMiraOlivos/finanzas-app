const postgres = require('../node_modules/postgres');
const fs = require('fs');
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const eq = line.indexOf('='); if (eq > 0) process.env[line.slice(0,eq).trim()] = line.slice(eq+1).trim();
}
const url = process.env.DATABASE_URL.replace(/-pooler(\.c-\d+\.)/, '$1').replace(/[&?]options=[^&]*/g, '');
const sql = postgres(url, { ssl: 'require', max: 1, connection: { search_path: 'finanzas' } });
(async () => {
  const totals = await sql`SELECT COUNT(*) as total, MIN(entry_date) as min_date, MAX(entry_date) as max_date FROM finanzas.journal_entries`;
  const acct   = await sql`SELECT account_code, COUNT(*) as n, SUM(credit) as total_credit FROM finanzas.journal_entries WHERE account_code = '510101' GROUP BY account_code`;
  console.log('journal_entries:', JSON.stringify(totals, null, 2));
  console.log('510101:', JSON.stringify(acct, null, 2));
  await sql.end();
})().catch(e => { console.error(e.message); process.exit(1); });
