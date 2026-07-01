import { formatCurrency, formatPercentage } from "@/lib/formatters";

type Props = {
  label: string;
  value: number | null;
  format: "currency" | "percentage" | "number";
  vsPriorPct?: number | null;
  vsBudgetPct?: number | null;
  onClick?: () => void;
  isActive?: boolean;
};

function DeltaBadge({ value, label }: { value: number | null | undefined; label: string }) {
  if (value == null) return null;
  const positive = value >= 0;
  const arrow    = positive ? "▲" : "▼";
  const color    = positive ? "text-ev-green" : "text-ev-red";
  return (
    <span className={["text-[10px] font-body tabular-nums", color].join(" ")}>
      {arrow} {formatPercentage(Math.abs(value))} {label}
    </span>
  );
}

export function ScenarioKpiCard({ label, value, format, vsPriorPct, vsBudgetPct, onClick, isActive }: Props) {
  const formatted =
    value === null ? "—"
    : format === "currency"   ? formatCurrency(value)
    : format === "percentage" ? formatPercentage(value)
    : String(value);

  const isNegative = typeof value === "number" && value < 0;
  const hasBadges  = vsPriorPct != null || vsBudgetPct != null;

  return (
    <div
      onClick={onClick}
      className={[
        "border bg-white p-5 flex flex-col gap-2",
        onClick ? "cursor-pointer" : "",
        isActive ? "border-ev-black ring-1 ring-ev-black" : "border-ev-gray7 hover:border-ev-gray4",
      ].join(" ")}
    >
      <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">{label}</p>
      <p className={["text-2xl font-head tabular-nums leading-none", isNegative ? "text-ev-red" : "text-ev-black"].join(" ")}>
        {formatted}
      </p>
      {hasBadges && (
        <div className="flex flex-col gap-0.5 mt-auto pt-1 border-t border-ev-gray7">
          <DeltaBadge value={vsPriorPct}  label="vs año ant." />
          <DeltaBadge value={vsBudgetPct} label="vs ppto." />
        </div>
      )}
    </div>
  );
}
