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
    <div className="border border-ev-gray7 bg-white p-5">
      <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 mb-2">{label}</p>
      <p className={["text-2xl font-head tabular-nums", isNegative ? "text-ev-red" : "text-ev-black"].join(" ")}>
        {formatted}
      </p>
      {description && (
        <p className="text-xs text-ev-gray4 mt-1 font-body">{description}</p>
      )}
    </div>
  );
}
