"use client";

import { useEffect, useState, useCallback } from "react";
import { BulletChartCard } from "./BulletChartCard";
import type { CompanyBulletKpi } from "@/app/api/dashboard/bullets/route";
import type { CurrencyUnit } from "@/lib/formatters";

type Props = {
  period: string;
  companyIds?: string | null;
  unit?: CurrencyUnit;
  onCompanyClick: (companyId: string) => void;
  activeCompanyIds?: string[];
};

type CompanyGroup = {
  companyId: string;
  companyName: string;
  metrics: CompanyBulletKpi[];
};

function groupByCompany(rows: CompanyBulletKpi[]): CompanyGroup[] {
  const map = new Map<string, CompanyGroup>();
  for (const row of rows) {
    if (!map.has(row.companyId)) {
      map.set(row.companyId, { companyId: row.companyId, companyName: row.companyName, metrics: [] });
    }
    map.get(row.companyId)!.metrics.push(row);
  }
  return Array.from(map.values());
}

export function CompanyBulletGrid({
  period,
  companyIds,
  unit = "millions",
  onCompanyClick,
  activeCompanyIds = [],
}: Props) {
  const [data,    setData]    = useState<CompanyBulletKpi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    const qs = new URLSearchParams({ period });
    if (companyIds) qs.set("companyIds", companyIds);
    fetch(`/api/dashboard/bullets?${qs}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<CompanyBulletKpi[]>; })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [period, companyIds]);

  useEffect(() => { load(); }, [load]);

  const totalGroup   = groupByCompany(data.filter((r) => r.companyId === "__total__"))[0] ?? null;
  const companyGroups = groupByCompany(data.filter((r) => r.companyId !== "__total__"));

  const hasSelection = activeCompanyIds.length > 0;

  return (
    <div className="border border-ev-gray7 bg-white">
      <div className="px-5 py-3 border-b border-ev-gray7">
        <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">
          Cumplimiento por empresa
        </p>
      </div>

      {loading && (
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <div className="h-3 w-28 bg-neutral-100 animate-pulse" />
              <div className="space-y-4">
                <div className="h-20 bg-neutral-100 animate-pulse" />
                <div className="h-20 bg-neutral-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="px-5 py-6 text-sm text-ev-gray3 font-body text-center">
          No se pudo cargar datos de cumplimiento.
        </p>
      )}

      {!loading && !error && companyGroups.length === 0 && (
        <p className="px-5 py-6 text-sm text-ev-gray3 font-body text-center">
          Sin datos de cumplimiento para el período seleccionado.
        </p>
      )}

      {!loading && !error && companyGroups.length > 0 && (
        <>
          {/* ── Total Grupo — only when multiple companies ── */}
          {totalGroup && (
            <div className="px-5 pt-5 pb-4 bg-ev-beige2 border-b border-ev-gray7">
              <p className="text-[10px] font-body font-semibold uppercase tracking-[0.08em] text-ev-black mb-4">
                Total Grupo
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                {totalGroup.metrics.map((m) => (
                  <BulletChartCard
                    key={m.metricCode}
                    metricCode={m.metricCode}
                    metricLabel={m.metricLabel}
                    actual={m.actual}
                    target={m.target}
                    ly={m.ly}
                    attainmentPct={m.attainmentPct}
                    varianceVsTarget={m.varianceVsTarget}
                    varianceVsTargetPct={m.varianceVsTargetPct}
                    varianceVsLy={m.varianceVsLy}
                    varianceVsLyPct={m.varianceVsLyPct}
                    status={m.status}
                    unit={unit}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Individual companies ── */}
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
            {companyGroups.map((g) => {
              const isActive = !hasSelection || activeCompanyIds.includes(g.companyId);
              return (
                <div
                  key={g.companyId}
                  className={[
                    "space-y-3 cursor-pointer group transition-opacity",
                    isActive ? "opacity-100" : "opacity-35 hover:opacity-70",
                  ].join(" ")}
                  onClick={() => onCompanyClick(g.companyId)}
                  title={`${isActive && hasSelection ? "Quitar filtro" : "Filtrar"}: ${g.companyName}`}
                >
                  <div className="flex items-center justify-between">
                    <p className={[
                      "text-[11px] font-body font-semibold uppercase tracking-[0.06em] truncate",
                      isActive ? "text-ev-black" : "text-ev-gray2 group-hover:text-ev-black",
                    ].join(" ")}>
                      {g.companyName}
                    </p>
                    {hasSelection && isActive && (
                      <span className="text-[9px] font-body text-ev-gray4 flex-shrink-0 ml-1">✕</span>
                    )}
                  </div>
                  <div className="space-y-5">
                    {g.metrics.map((m) => (
                      <BulletChartCard
                        key={m.metricCode}
                        metricCode={m.metricCode}
                        metricLabel={m.metricLabel}
                        actual={m.actual}
                        target={m.target}
                        ly={m.ly}
                        attainmentPct={m.attainmentPct}
                        varianceVsTarget={m.varianceVsTarget}
                        varianceVsTargetPct={m.varianceVsTargetPct}
                        varianceVsLy={m.varianceVsLy}
                        varianceVsLyPct={m.varianceVsLyPct}
                        status={m.status}
                        unit={unit}
                        period={period}
                        companyId={g.companyId}
                        companyIds={companyIds}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
