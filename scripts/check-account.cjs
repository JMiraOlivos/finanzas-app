/**
 * Verifica el estado de una cuenta en journal_entries y account_pnl_mappings.
 * Uso: node scripts/check-account.cjs 510101
 */
const postgres = require('../node_modules/postgres');
const fs = require('fs');

const code = process.argv[2];
if (!code) { console.error('Uso: node scripts/check-account.cjs <account_code>'); process.exit(1); }

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const eq = line.indexOf('=');
  if (eq > 0) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
}

const url = process.env.DATABASE_URL
  .replace(/-pooler(\.c-\d+\.)/, '$1')
  .replace(/[&?]options=[^&]*/g, '');

const sql = postgres(url, { ssl: 'require', max: 1, connection: { search_path: 'finanzas' } });

async function main() {
  const je = await sql`
    SELECT account_code, account_name, is_pnl,
           COUNT(*) AS n, SUM(debit) AS total_debit, SUM(credit) AS total_credit, SUM(amount) AS total_amount
    FROM finanzas.journal_entries
    WHERE account_code = ${code}
    GROUP BY account_code, account_name, is_pnl
  `;
  console.log('journal_entries:', JSON.stringify(je, null, 2));

  const mapping = await sql`
    SELECT apm.account_code, apm.account_name, apm.sign_multiplier,
           pl.code AS pnl_line_code, pl.label AS pnl_line_label, pl.parent_code
    FROM finanzas.account_pnl_mappings apm
    JOIN finanzas.pnl_lines pl ON pl.id = apm.pnl_line_id
    WHERE apm.account_code = ${code}
  `;
  console.log('mapping:', JSON.stringify(mapping, null, 2));

  await sql.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
