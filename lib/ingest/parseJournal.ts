import * as XLSX from "xlsx";

export type ParsedRow = {
  entryDate: Date;
  periodMonth: Date;
  accountCode: string;
  accountName: string | null;
  description: string | null;
  documentNumber: string | null;
  debit: number;
  credit: number;
  amount: number;
  isPnl: boolean;
  sourceRowNumber: number;
};

type ColumnMap = {
  entryDate: number;
  accountCode: number;
  accountName: number | null;
  description: number | null;
  documentNumber: number | null;
  debit: number | null;
  credit: number | null;
  amount: number | null;
};

function findCol(headers: string[], candidates: string[]): number | null {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h.toLowerCase().includes(c.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return null;
}

function normalizeAccountCode(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  let s = String(raw).trim();
  if (s.endsWith(".0")) s = s.slice(0, -2);
  return s;
}

function toNumber(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return raw;
  const s = String(raw)
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\((.+)\)/, "-$1");

  // Handle European-style: 1.234,56 → 1234.56
  if (/[,.]/.test(s)) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    }
    return parseFloat(s.replace(/,/g, "")) || 0;
  }
  return parseFloat(s) || 0;
}

function toDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(raw);
    if (!d) return null;
    return new Date(d.y, d.m - 1, d.d);
  }
  const s = String(raw).trim();
  // DD-MM-YYYY or DD/MM/YYYY (Chilean / Latin American format)
  const dmy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (dmy) {
    return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function detectColumns(headers: string[]): ColumnMap | null {
  const entryDate = findCol(headers, ["fecha", "date", "fec"]);
  const accountCode = findCol(headers, ["cuenta_codigo", "cuenta codigo", "codigo", "cuenta", "account_code", "account"]);
  if (entryDate === null || accountCode === null) return null;

  return {
    entryDate,
    accountCode,
    accountName: findCol(headers, ["cuenta_nombre", "nombre cuenta", "account_name", "nombre"]),
    description: findCol(headers, ["glosa", "descripcion", "descripción", "description", "detalle"]),
    documentNumber: findCol(headers, ["documento", "doc", "comprobante", "folio"]),
    debit: findCol(headers, ["debe", "debito", "débito", "debit", "debe_ml"]),
    credit: findCol(headers, ["haber", "credito", "crédito", "credit", "haber_ml"]),
    amount: findCol(headers, ["monto", "amount", "saldo_ml", "saldo", "importe"]),
  };
}

export function parseJournalBuffer(buffer: Buffer, filename: string): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to array-of-arrays (raw values, no header parsing yet)
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  if (raw.length < 2) throw new Error("El archivo está vacío o tiene menos de 2 filas.");

  // Try to detect header row (first row with text-like values)
  const firstRow = raw[0].map((v) => (v === null ? "" : String(v).trim()));
  const colMap = detectColumns(firstRow);

  let dataRows: unknown[][];
  let cm: ColumnMap;

  if (colMap) {
    dataRows = raw.slice(1);
    cm = colMap;
  } else {
    // No headers detected. Sniff the format from the first non-empty data row.
    // Some files (e.g. ERP exports) have a blank/null row at the top before data starts.
    let fmtOffset = 0;
    while (fmtOffset < raw.length - 1 && raw[fmtOffset].every((v) => v === null || v === "")) {
      fmtOffset++;
    }
    const r0 = raw[fmtOffset];
    if (!r0 || r0.length < 5) {
      throw new Error(`No se pueden detectar columnas en ${filename}. Formato desconocido.`);
    }

    // Format A (10 cols, no headers):
    //   [0]=fecha [1]=tipo [2]=ndoc [3]=linea [4]=glosa
    //   [5]=cuenta_cod [6]=cuenta_nom [7]=otro [8]=debe [9]=haber
    // Detected when col 5 looks like a numeric account code and file has ≥10 cols.
    const col5 = r0[5] !== null && r0[5] !== undefined ? String(r0[5]).trim() : "";
    const isFormatA = r0.length >= 10 && /^\d{4,}$/.test(col5.replace(/\./g, ""));

    if (isFormatA) {
      dataRows = raw.slice(fmtOffset);
      cm = {
        entryDate:      0,
        accountCode:    5,
        accountName:    6,
        description:    4,
        documentNumber: 2,
        debit:          8,   // col 8 = debe
        credit:         9,   // col 9 = haber  (col 7 is an unrelated field)
        amount:         null,
      };
    } else {
      // Generic fallback: fecha | cuenta | nombre | glosa | debe | haber
      dataRows = raw.slice(fmtOffset);
      cm = {
        entryDate:      0,
        accountCode:    1,
        accountName:    2,
        description:    3,
        documentNumber: null,
        debit:          4,
        credit:         5,
        amount:         null,
      };
    }
  }

  const results: ParsedRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row || row.every((v) => v === null || v === "")) continue;

    const entryDate = toDate(row[cm.entryDate]);
    const accountCode = normalizeAccountCode(row[cm.accountCode]);

    if (!entryDate || !accountCode) continue;

    const accountName = cm.accountName !== null ? (row[cm.accountName] ? String(row[cm.accountName]).trim() : null) : null;
    const description = cm.description !== null ? (row[cm.description] ? String(row[cm.description]).trim() : null) : null;
    const documentNumber = cm.documentNumber !== null ? (row[cm.documentNumber] ? String(row[cm.documentNumber]).trim() : null) : null;

    let debit: number;
    let credit: number;
    let amount: number;

    if (cm.amount !== null && row[cm.amount] !== null && row[cm.amount] !== "") {
      amount = toNumber(row[cm.amount]);
      debit = amount < 0 ? Math.abs(amount) : 0;
      credit = amount >= 0 ? amount : 0;
    } else {
      debit = cm.debit !== null ? toNumber(row[cm.debit]) : 0;
      credit = cm.credit !== null ? toNumber(row[cm.credit]) : 0;
      amount = credit - debit;
    }

    const isPnl = /^[456]/.test(accountCode);

    results.push({
      entryDate,
      periodMonth: firstOfMonth(entryDate),
      accountCode,
      accountName,
      description,
      documentNumber,
      debit,
      credit,
      amount,
      isPnl,
      sourceRowNumber: i + (colMap ? 2 : 1),
    });
  }

  return results;
}
