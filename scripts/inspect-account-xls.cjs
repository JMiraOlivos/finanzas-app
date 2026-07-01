/**
 * Muestra todas las filas del XLS donde col5 = account_code dado.
 * Uso: node scripts/inspect-account-xls.cjs <file.xls> <account_code>
 */
const XLSX = require('../node_modules/xlsx');
const fs   = require('fs');

const [,, filePath, code] = process.argv;
if (!filePath || !code) {
  console.error('Uso: node scripts/inspect-account-xls.cjs <file.xls> <account_code>');
  process.exit(1);
}

const buf  = fs.readFileSync(filePath);
const wb   = XLSX.read(buf, { type: 'buffer', raw: true });
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

console.log(`Total filas: ${rows.length}`);
console.log('Col layout: [0]=fecha [1]=tipo [2]=ndoc [3]=linea [4]=glosa [5]=cuenta_cod [6]=cuenta_nom [7]=debe [8]=haber [9]=saldo\n');

let matchCount = 0, sumDebe = 0, sumHaber = 0, sumSaldo = 0;

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const col5 = r[5] != null ? String(r[5]).trim().replace(/\.0$/, '') : '';
  if (col5 === code) {
    matchCount++;
    const debe  = Number(r[7]) || 0;
    const haber = Number(r[8]) || 0;
    const saldo = Number(r[9]) || 0;
    sumDebe  += debe;
    sumHaber += haber;
    sumSaldo += saldo;
    console.log(`Row ${i}: fecha=${r[0]} | tipo=${r[1]} | ndoc=${r[2]} | glosa="${r[4]}" | debe=${debe.toLocaleString('es-CL')} | haber=${haber.toLocaleString('es-CL')} | saldo=${saldo.toLocaleString('es-CL')}`);
  }
}

console.log(`\nTotal filas: ${matchCount}`);
console.log(`Suma debe:   ${sumDebe.toLocaleString('es-CL')}`);
console.log(`Suma haber:  ${sumHaber.toLocaleString('es-CL')}`);
console.log(`Suma saldo:  ${sumSaldo.toLocaleString('es-CL')}`);
