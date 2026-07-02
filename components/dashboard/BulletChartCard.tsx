"use client";

import { BulletChart } from "./BulletChart";
import { formatCurrency, formatPercentage } from "@/lib/formatters";
import type { CompanyBulletKpi } from "@/app/api/dashboard/bullets/route";

type Status = CompanyBulletKpi["status"];

const STATUS_BADGE: Record<Status, string> = {
  red:    "bg-red-100 text-ev-red",
  yellow: "bg-yellow-100 text-yellow-700",
  green:  "bg-green-100 text-ev-green",
  blue:   "bg-blue-100 text-blue-700",
  gray:   "bg-neutral-100 text-ev-gray4",
};

type Props = Pick<
  CompanyBulletKpi,
  | "metricLabel"
  | "actual"
  | "target"
  | "ly"
  | "attainmentPct"
  | "varianceVsTarget"
  | "varianceVsTargetPct"
  | "status"
>;

export function BulletChartCard({
  metricLabel,
  actual,
  target,
  ly,
  attainmentPct,
  varianceVsTarget,
  varianceVsTargetPct,
  status,
}: Props) {
  const varPositive = varianceVsTarget !== null && varianceVsTarget >= 0;

  return (
    <div className="space-y-2">
      {/* Label + attainment badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-body font-medium text-ev-gray2">{metricLabel}</span>
        <span className={["text-[10px] font-body font-medium px-2 py-0.5 whitespace-nowrap", STATUS_BADGE[status]].join(" ")}>
          {attainmentPct !== null ? formatPercentage(attainmentPct) : "Sin ppto"}
        </span>
      </div>

      {/* Bullet chart SVG */}
      <BulletChart actual={actual} target={target} ly={ly} status={status} />

      {/* Values: actual / target / LY */}
      <div className="grid grid-cols-3 gap-1 text-[10px] font-body tabular-nums">
        <div>
          <div className="text-ev-black font-medium">{actual !== null ? formatCurrency(actual) : "—"}</div>
          <div className="text-ev-gray4">Real</div>
        </div>
        <div>
          <div className="text-ev-gray3 font-medium">{target !== null ? formatCurrency(target) : "—"}</div>
          <div className="text-ev-gray4">Ppto</div>
        </div>
        <div>
          <div className="text-ev-gray5">{ly !== null ? formatCurrency(ly) : "—"}</div>
          <div className="text-ev-gray4">LY</div>
        </div>
      </div>

      {/* Variance vs target */}
      {varianceVsTarget !== null && (
        <div className={["text-[10px] font-body tabular-nums", varPositive ? "text-ev-green" : "text-ev-red"].join(" ")}>
          {varPositive ? "▲" : "▼"}{" "}
          {formatCurrency(Math.abs(varianceVsTarget))}
          {varianceVsTargetPct !== null && (
            <span className="ml-1 opacity-70">
              ({formatPercentage(Math.abs(varianceVsTargetPct))})
            </span>
          )}
          {" "}vs ppto
        </div>
      )}
    </div>
  );
}
