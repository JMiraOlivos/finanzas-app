import { formatCurrency, formatPercentage } from "@/lib/formatters";

type Props = {
  label: string;
  value: number | null;
  format: "currency" | "percentage" | "number";
  description?: string;
};

export function KpiCard({ label, value, format, description }: Props) {
  const formatted =
    value === null ? "—"
    : format === "currency"    ? formatCurrency(value)
    : format === "percentage"  ? formatPercentage(value)
    : String(value);

  const isNegative = typeof value === "number" && value < 0;

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-neutral-500 mb-1">{label}</p>
      <p className={["text-2xl font-semibold tabular-nums", isNegative ? "text-red-600" : "text-neutral-900"].join(" ")}>
        {formatted}
      </p>
      {description && (
        <p className="text-xs text-neutral-400 mt-1">{description}</p>
      )}
    </div>
  );
}
