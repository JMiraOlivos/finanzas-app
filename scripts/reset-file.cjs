/**
 * Borra journal_entries y uploaded_files para un archivo dado.
 * Uso: node scripts/reset-file.cjs "diarioext.xls"
 */
const postgres = require('../node_modules/postgres');
const fs = require('fs');

const filename = process.argv[2];
if (!filename) {
  console.error('Uso: node scripts/reset-file.cjs <nombre-archivo>');
  process.exit(1);
}

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const eq = line.indexOf('=');
  if (eq > 0) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
}

const url = process.env.DATABASE_URL
  .replace(/-pooler(\.c-\d+\.)/, '$1')
  .replace(/[&?]options=[^&]*/g, '');

const sql = postgres(url, { ssl: 'require', max: 1, connection: { search_path: 'finanzas' } });

async function main() {
  const files = await sql`
    SELECT id, original_filename, status, row_count
    FROM finanzas.uploaded_files
    WHERE original_filename = ${filename}
  `;

  if (files.length === 0) {
    console.log(`No se encontraron registros para "${filename}".`);
    await sql.end();
    return;
  }

  for (const f of files) {
    console.log(`Encontrado: ${f.original_filename} | id=${f.id} | status=${f.status} | rows=${f.row_count}`);
    const del = await sql`
      DELETE FROM finanzas.journal_entries WHERE uploaded_file_id = ${f.id}
    `;
    console.log(`  → Borradas ${del.count} filas de journal_entries`);
  }

  const delFiles = await sql`
    DELETE FROM finanzas.uploaded_files WHERE original_filename = ${filename}
  `;
  console.log(`  → Borrados ${delFiles.count} registros de uploaded_files`);
  console.log('Listo. Ahora puedes re-subir el archivo desde /admin/upload.');
  await sql.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
