"use client";

import { BulletChart, type BulletZone } from "./BulletChart";
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

// Light pastel fills for zone backgrounds — bar (dark) sits on top
const ZONE_COLORS = {
  red:    "#FECACA", // red-200
  yellow: "#FDE68A", // amber-200
  green:  "#BBF7D0", // green-200
  blue:   "#BFDBFE", // blue-200
};

function computeZones(
  target: number | null,
  metricCode: CompanyBulletKpi["metricCode"]
): BulletZone[] {
  if (target === null || target <= 0) return [];

  const [t1, t2, t3] = metricCode === "EBITDA_YTD"
    ? [0.75, 0.95, 1.05]
    : [0.80, 0.95, 1.05];

  return [
    { from: 0,           to: t1 * target, color: ZONE_COLORS.red    },
    { from: t1 * target, to: t2 * target, color: ZONE_COLORS.yellow  },
    { from: t2 * target, to: t3 * target, color: ZONE_COLORS.green   },
    { from: t3 * target, to: Infinity,    color: ZONE_COLORS.blue    },
  ];
}

type Props = Pick<
  CompanyBulletKpi,
  | "metricCode"
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
  metricCode,
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
  const zones = computeZones(target, metricCode);

  return (
    <div className="space-y-2">
      {/* Label + attainment badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-body font-medium text-ev-gray2">{metricLabel}</span>
        <span className={["text-[10px] font-body font-medium px-2 py-0.5 whitespace-nowrap", STATUS_BADGE[status]].join(" ")}>
          {attainmentPct !== null ? formatPercentage(attainmentPct) : "Sin ppto"}
        </span>
      </div>

      {/* Bullet chart SVG with zone backgrounds */}
      <BulletChart actual={actual} target={target} ly={ly} status={status} zones={zones} />

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
