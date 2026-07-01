/**
 * Muestra todas las columnas de las filas de una cuenta dada.
 * Uso: node scripts/inspect-cols.cjs <file.xls> <account_code> [max_rows]
 */
const XLSX = require('../node_modules/xlsx');
const fs   = require('fs');

const [,, filePath, code, maxStr] = process.argv;
const maxRows = parseInt(maxStr || '999999');

const buf  = fs.readFileSync(filePath);
const wb   = XLSX.read(buf, { type: 'buffer', raw: true });
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

let n = 0, sumC7=0, sumC8=0, sumC9=0;
for (let i = 0; i < rows.length && n < maxRows; i++) {
  const r = rows[i];
  const col5 = r[5] != null ? String(r[5]).trim().replace(/\.0$/,'') : '';
  if (col5 !== code) continue;
  n++;
  const c7 = Number(r[7])||0, c8 = Number(r[8])||0, c9 = Number(r[9])||0;
  sumC7+=c7; sumC8+=c8; sumC9+=c9;
  console.log(`Row ${i}: ${r[0]} | c7(H)=${c7.toLocaleString('es-CL')} | c8(I)=${c8.toLocaleString('es-CL')} | c9(J)=${c9.toLocaleString('es-CL')} | "${r[4]}"`);
}
console.log(`\nTotal ${n} filas`);
console.log(`Sum col7(H): ${sumC7.toLocaleString('es-CL')}`);
console.log(`Sum col8(I): ${sumC8.toLocaleString('es-CL')}`);
console.log(`Sum col9(J): ${sumC9.toLocaleString('es-CL')}`);
