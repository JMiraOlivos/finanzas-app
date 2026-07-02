const clpFormatter = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const pctFormatter = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const mmFormatter = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const mFormatter = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export type CurrencyUnit = "full" | "thousands" | "millions";

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const abs = Math.abs(value);
  const formatted = clpFormatter.format(abs);
  return value < 0 ? `(${formatted})` : formatted;
}

export function formatCurrencyUnit(
  value: number | null | undefined,
  unit: CurrencyUnit,
): string {
  if (value === null || value === undefined) return "";
  if (unit === "full") return formatCurrency(value);
  if (unit === "millions") {
    const scaled = value / 1_000_000;
    const abs = Math.abs(scaled);
    const s = `${mmFormatter.format(abs)} MM`;
    return scaled < 0 ? `(${s})` : s;
  }
  // thousands
  const scaled = value / 1_000;
  const abs = Math.abs(scaled);
  const s = `${mFormatter.format(abs)} M`;
  return scaled < 0 ? `(${s})` : s;
}

export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const abs = Math.abs(value * 100);
  const formatted = pctFormatter.format(abs);
  return value < 0 ? `(${formatted}%)` : `${formatted}%`;
}

export function formatFinancialValue(
  value: number | null | undefined,
  type: "currency" | "percentage" | "number"
): string {
  if (type === "percentage") return formatPercentage(value);
  if (type === "currency") return formatCurrency(value);
  if (value === null || value === undefined) return "";
  return String(value);
}

export function formatPeriodMonth(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date + "T12:00:00Z") : date;
  return d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

export function toMonthDate(yearMonth: string): string {
  // Accepts "2025-12" or "2025-12-01" → returns "2025-12-01"
  if (/^\d{4}-\d{2}$/.test(yearMonth)) return `${yearMonth}-01`;
  return yearMonth;
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
