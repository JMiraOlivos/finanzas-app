/**
 * Importa pnl_mapping_rules.json → account_pnl_mappings en Neon.
 * Solo importa reglas exactas (rule_type = "exact").
 * Los fallbacks de prefijo se saltan — el admin/mappings maneja las cuentas nuevas.
 *
 * Uso: node scripts/import-mapping-rules.cjs
 *      node scripts/import-mapping-rules.cjs --dry-run   (muestra sin insertar)
 */

const postgres = require('../node_modules/postgres');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const eq = line.indexOf('=');
  if (eq > 0) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
}

const url = process.env.DATABASE_URL
  .replace(/-pooler(\.c-\d+\.)/, '$1')
  .replace(/[&?]options=[^&]*/g, '');

const sql = postgres(url, { ssl: 'require', max: 1, connection: { search_path: 'finanzas' } });

// Traducción nivel2 (JSON) → código pnl_lines + sign_multiplier
const NIVEL_TO_LINE = {
  'Ingresos por Ventas':         { code: 'INGRESOS_DETALLE',  sign: 1  },
  'Ingresos por Arriendo':       { code: 'INGRESOS_DETALLE',  sign: 1  },
  'Costo por Comisiones':        { code: 'BONO_CAPTACION',    sign: -1 },
  'Captación Honorarios':        { code: 'BONO_CAPTACION',    sign: -1 },
  'Royalties':                   { code: 'ROYALTIES',         sign: -1 },
  'Royalties Alemania':          { code: 'ROYALTIES',         sign: -1 },
  'IT Alemania':                 { code: 'GASTOS_IT_ALEMANIA',sign: -1 },
  'Remuneraciones':              { code: 'REMUNERACIONES',    sign: -1 },
  'Publicidad':                  { code: 'GASTOS_MARKETING',  sign: -1 },
  'Arriendos y Gastos Comunes':  { code: 'ARRIENDOS',         sign: -1 },
};

async function main() {
  const rulesPath = path.resolve(
    __dirname,
    '../../finanzas-evidence/etl/config/pnl_mapping_rules.json'
  );
  const { rules } = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  const exactRules = rules.filter(r => r.rule_type === 'exact' && r.activa);

  // Cargar pnl_lines para obtener IDs por código
  const lines = await sql`SELECT id, code FROM finanzas.pnl_lines`;
  const lineByCode = Object.fromEntries(lines.map(l => [l.code, l.id]));

  let inserted = 0, skipped = 0, unknown = 0;

  for (const rule of exactRules) {
    const translation = NIVEL_TO_LINE[rule.nivel2];
    if (!translation) {
      console.log(`⚠  Sin traducción para nivel2="${rule.nivel2}" (${rule.pattern}) — omitido`);
      unknown++;
      continue;
    }

    const pnlLineId = lineByCode[translation.code];
    if (!pnlLineId) {
      console.log(`⚠  Código pnl_line "${translation.code}" no existe en DB — omitido`);
      unknown++;
      continue;
    }

    // Verificar si ya existe algún mapeo para este account_code (global o por empresa)
    const existing = await sql`
      SELECT id FROM finanzas.account_pnl_mappings
      WHERE account_code = ${rule.pattern}
      LIMIT 1
    `;

    if (existing.length > 0) {
      console.log(`→  ${rule.pattern} ya mapeado — skip`);
      skipped++;
      continue;
    }

    // Obtener nombre de cuenta desde journal_entries si existe
    const je = await sql`
      SELECT account_name FROM finanzas.journal_entries
      WHERE account_code = ${rule.pattern}
      LIMIT 1
    `;
    const accountName = je.length > 0 ? je[0].account_name : rule.description;

    if (DRY_RUN) {
      console.log(`[DRY] INSERT ${rule.pattern} "${accountName}" → ${translation.code} (sign=${translation.sign})`);
      inserted++;
      continue;
    }

    await sql`
      INSERT INTO finanzas.account_pnl_mappings
        (company_id, account_code, account_name, pnl_line_id, sign_multiplier, is_active)
      VALUES
        (NULL, ${rule.pattern}, ${accountName}, ${pnlLineId}, ${translation.sign}, TRUE)
      ON CONFLICT (company_id, account_code) DO NOTHING
    `;
    console.log(`✓  ${rule.pattern} "${accountName}" → ${translation.code} (sign=${translation.sign})`);
    inserted++;
  }

  console.log(`\nResumen: ${inserted} insertados, ${skipped} ya existían, ${unknown} sin traducción`);
  await sql.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
