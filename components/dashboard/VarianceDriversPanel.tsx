"use client";

import { useEffect, useState, useCallback } from "react";
import { formatCurrency, formatPercentage } from "@/lib/formatters";
import type { DriverRow, DriversPayload } from "@/app/api/dashboard/drivers/route";

type Comparison = "ly" | "budget";

type Props = {
  period: string;
  companyIds?: string | null;
};

export function VarianceDriversPanel({ period, companyIds }: Props) {
  const [comparison, setComparison] = useState<Comparison>("budget");
  const [data,       setData]       = useState<DriversPayload | null>(null);
  const [loading,    setLoading]    = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ period, comparison });
    if (companyIds) qs.set("companyIds", companyIds);
    fetch(`/api/dashboard/drivers?${qs}`)
      .then((r) => r.json() as Promise<DriversPayload>)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period, comparison, companyIds]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="border border-ev-gray7 bg-white">
      <div className="px-5 py-3 border-b border-ev-gray7 flex items-center justify-between">
        <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">Drivers de variación YTD</p>
        <div className="flex border border-ev-gray6 overflow-hidden text-xs">
          {(["budget", "ly"] as Comparison[]).map((c, i) => (
            <button
              key={c}
              onClick={() => setComparison(c)}
              className={[
                "px-3 py-1 font-body font-medium",
                i > 0 ? "border-l border-ev-gray6" : "",
                comparison === c ? "bg-ev-black text-white" : "bg-white text-ev-gray2 hover:bg-ev-beige2",
              ].join(" ")}
            >
              {c === "budget" ? "vs Ppto." : "vs LY"}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              {[0,1,2,3,4].map((j) => (
                <div key={j} className="h-8 bg-neutral-100 animate-pulse rounded" />
              ))}
            </div>
          ))}
        </div>
      )}

      {!loading && data && (data.positive.length > 0 || data.negative.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* Positivos */}
          <div className="p-5 border-b md:border-b-0 md:border-r border-ev-gray7">
            <p className="text-[10px] font-body uppercase tracking-[0.1em] text-green-600 mb-3">
              Drivers positivos
            </p>
            {data.positive.length === 0 && (
              <p className="text-xs text-ev-gray3 font-body">Sin drivers positivos</p>
            )}
            <div className="space-y-2">
              {data.positive.map((d) => (
                <DriverItem key={d.pnlLineCode} row={d} positive />
              ))}
            </div>
          </div>

          {/* Negativos */}
          <div className="p-5">
            <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-red mb-3">
              Drivers negativos
            </p>
            {data.negative.length === 0 && (
              <p className="text-xs text-ev-gray3 font-body">Sin drivers negativos</p>
            )}
            <div className="space-y-2">
              {data.negative.map((d) => (
                <DriverItem key={d.pnlLineCode} row={d} positive={false} />
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && data && data.positive.length === 0 && data.negative.length === 0 && (
        <p className="px-5 py-6 text-sm text-ev-gray3 font-body text-center">
          Sin datos de variación para el período seleccionado
        </p>
      )}
    </div>
  );
}

function DriverItem({ row, positive }: { row: DriverRow; positive: boolean }) {
  const color  = positive ? "text-green-600 bg-green-50" : "text-ev-red bg-red-50";
  const arrow  = positive ? "▲" : "▼";

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="font-body text-ev-black truncate">{row.pnlLineLabel}</span>
      <span className={["tabular-nums text-xs font-body px-2 py-0.5 rounded font-medium whitespace-nowrap", color].join(" ")}>
        {arrow} {formatCurrency(Math.abs(row.varianceAmount))}
        {row.variancePct !== null && (
          <span className="ml-1 opacity-70">
            ({formatPercentage(Math.abs(row.variancePct))})
          </span>
        )}
      </span>
    </div>
  );
}
