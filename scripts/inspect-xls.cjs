const XLSX = require('../node_modules/xlsx');
const path = require('path');
const fs   = require('fs');

// Pass file path as argument: node scripts/inspect-xls.cjs path/to/file.xls
const filePath = process.argv[2];
if (!filePath) { console.error('Usage: node scripts/inspect-xls.cjs <file>'); process.exit(1); }

const buf = fs.readFileSync(filePath);
const wb  = XLSX.read(buf, { type: 'buffer', raw: true });
const ws  = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

console.log('Sheet:', wb.SheetNames[0]);
console.log('Total rows:', rows.length);
console.log('\nRow 0 (headers):');
console.log(JSON.stringify(rows[0]));
console.log('\nRow 1 (first data row):');
console.log(JSON.stringify(rows[1]));
console.log('\nRow 2:');
console.log(JSON.stringify(rows[2]));
