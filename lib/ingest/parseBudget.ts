import * as XLSX from "xlsx";

export type BudgetRow = {
  companyName: string;
  periodMonth: string;   // "YYYY-MM-01"
  accountName: string;   // raw account name from file — mapped to pnl_line in loadBudget
  amount: number;
  sourceRow: number;
};

export type BudgetParseError = { row: number; message: string };

export type BudgetParseResult = {
  rows: BudgetRow[];
  errors: BudgetParseError[];
};

function findCol(headers: string[], candidates: string[]): number | null {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim().includes(c.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return null;
}

function parseAmount(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^0-9.,\-]/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

function parsePeriod(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  // Accept YYYY-MM or YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})(-\d{2})?$/);
  if (!m) return null;
  const [, y, mo] = m;
  const d = new Date(Number(y), Number(mo) - 1, 1);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10); // "YYYY-MM-01"
}

export function parseBudgetBuffer(buffer: Buffer, filename: string): BudgetParseResult {
  const ext = filename.split(".").pop()?.toLowerCase();
  const wb  = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const ws  = wb.Sheets[wb.SheetNames[0]];

  let raw: unknown[][];
  if (ext === "csv") {
    raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });
  } else {
    raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });
  }

  const rows: BudgetRow[]        = [];
  const errors: BudgetParseError[] = [];

  // Find header row (first row that has at least 3 non-empty cells)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    const nonEmpty = (raw[i] as unknown[]).filter((c) => c != null && c !== "").length;
    if (nonEmpty >= 3) { headerIdx = i; break; }
  }

  const headers = (raw[headerIdx] as unknown[]).map((h) => String(h ?? "").toLowerCase().trim());

  const colEmpresa  = findCol(headers, ["empresa", "company", "compañia"]);
  const colPeriodo  = findCol(headers, ["periodo", "period", "mes", "month"]);
  const colLinea    = findCol(headers, ["cuenta", "linea_pnl", "linea", "pnl_line", "line"]);
  const colMonto    = findCol(headers, ["monto", "amount", "importe", "valor"]);

  const missing: string[] = [];
  if (colEmpresa === null) missing.push("empresa");
  if (colPeriodo === null) missing.push("periodo");
  if (colLinea   === null) missing.push("cuenta");
  if (colMonto   === null) missing.push("monto");

  if (missing.length > 0) {
    throw new Error(
      `Columnas requeridas no encontradas: ${missing.join(", ")}. ` +
      `Encabezados detectados: ${headers.join(", ")}`
    );
  }

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    // Skip empty rows
    if (row.every((c) => c == null || c === "")) continue;

    const companyName = String(row[colEmpresa!] ?? "").trim();
    const periodo     = parsePeriod(row[colPeriodo!]);
    const lineaRaw    = String(row[colLinea!] ?? "").trim();
    const amount      = parseAmount(row[colMonto!]);
    const srcRow      = i + 1; // 1-indexed

    if (!companyName) { errors.push({ row: srcRow, message: "Empresa vacía" }); continue; }
    if (!periodo)     { errors.push({ row: srcRow, message: `Período inválido: "${row[colPeriodo!]}"` }); continue; }
    if (!lineaRaw)    { errors.push({ row: srcRow, message: "Cuenta vacía" }); continue; }
    if (amount === null) { errors.push({ row: srcRow, message: `Monto inválido: "${row[colMonto!]}"` }); continue; }

    rows.push({ companyName, periodMonth: periodo, accountName: lineaRaw, amount, sourceRow: srcRow });
  }

  return { rows, errors };
}
