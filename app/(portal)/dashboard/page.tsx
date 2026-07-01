"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { ScenarioKpiCard } from "@/components/dashboard/ScenarioKpiCard";
import { AlertsPanel, type Alert } from "@/components/dashboard/AlertsPanel";
import { ClosureStatusPanel, type ControlRow } from "@/components/dashboard/ClosureStatusPanel";
import { CompanyRanking, type CompanyRankingRow } from "@/components/dashboard/CompanyRanking";
import type { ChartsData } from "@/components/dashboard/DashboardCharts";

const DashboardCharts = dynamic(
  () => import("@/components/dashboard/DashboardCharts").then((m) => ({ default: m.DashboardCharts })),
  { ssr: false }
);

type KpiMetric = {
  code: string;
  label: string;
  value: number | null;
  format: string;
};

const FEATURED_CODES = ["REVENUE_YTD", "EBITDA_YTD", "EBITDA_MARGIN", "RESULTADO_FINAL"];

const VS_PRIOR_MAP: Record<string, string> = {
  REVENUE_YTD: "REVENUE_VS_PRIOR_PCT",
  EBITDA_YTD:  "EBITDA_VS_PRIOR_PCT",
};
const VS_BUDGET_MAP: Record<string, string> = {
  REVENUE_YTD: "REVENUE_VS_BUDGET_PCT",
  EBITDA_YTD:  "EBITDA_VS_BUDGET_PCT",
};

function defaultPeriod() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDay = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getDate();
  return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-${lastDay}`;
}

export default function DashboardPage() {
  const [period,         setPeriod]         = useState(defaultPeriod);
  const [kpis,           setKpis]           = useState<KpiMetric[]>([]);
  const [chartsData,     setChartsData]     = useState<ChartsData | null>(null);
  const [ranking,         setRanking]         = useState<CompanyRankingRow[]>([]);
  const [alerts,          setAlerts]          = useState<Alert[]>([]);
  const [control,         setControl]         = useState<ControlRow[]>([]);
  const [kpisLoading,     setKpisLoading]     = useState(true);
  const [chartsLoading,   setChartsLoading]   = useState(true);
  const [rankingLoading,  setRankingLoading]  = useState(true);
  const [alertsLoading,   setAlertsLoading]   = useState(true);
  const [controlLoading,  setControlLoading]  = useState(true);
  const [error,           setError]           = useState<string | null>(null);

  const fetchKpis = useCallback(() => {
    setKpisLoading(true);
    setError(null);
    fetch(`/api/dashboard?period=${period}`)
      .then((r) => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json() as Promise<KpiMetric[]>; })
      .then(setKpis)
      .catch((e: Error) => setError(e.message))
      .finally(() => setKpisLoading(false));
  }, [period]);

  const fetchCharts = useCallback(() => {
    setChartsLoading(true);
    fetch(`/api/dashboard/charts?period=${period}`)
      .then((r) => r.json() as Promise<ChartsData>)
      .then(setChartsData)
      .catch(() => {})
      .finally(() => setChartsLoading(false));
  }, [period]);

  const fetchRanking = useCallback(() => {
    setRankingLoading(true);
    fetch(`/api/dashboard/ranking?period=${period}`)
      .then((r) => r.json() as Promise<CompanyRankingRow[]>)
      .then(setRanking)
      .catch(() => {})
      .finally(() => setRankingLoading(false));
  }, [period]);

  const fetchAlerts = useCallback(() => {
    setAlertsLoading(true);
    fetch(`/api/dashboard/alerts?period=${period}`)
      .then((r) => r.json() as Promise<Alert[]>)
      .then(setAlerts)
      .catch(() => {})
      .finally(() => setAlertsLoading(false));
  }, [period]);

  const fetchControl = useCallback(() => {
    setControlLoading(true);
    fetch(`/api/dashboard/control?period=${period}`)
      .then((r) => r.json() as Promise<ControlRow[]>)
      .then(setControl)
      .catch(() => {})
      .finally(() => setControlLoading(false));
  }, [period]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);
  useEffect(() => { fetchCharts(); }, [fetchCharts]);
  useEffect(() => { fetchRanking(); }, [fetchRanking]);
  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);
  useEffect(() => { fetchControl(); }, [fetchControl]);

  const kpiMap = Object.fromEntries(kpis.map((k) => [k.code, k]));

  // Cards: secondary KPIs (not in FEATURED_CODES and not the vs/attain metrics)
  const secondaryKpis = kpis.filter(
    (k) => !FEATURED_CODES.includes(k.code) &&
            !Object.values(VS_PRIOR_MAP).includes(k.code) &&
            !Object.values(VS_BUDGET_MAP).includes(k.code) &&
            k.code !== "EBITDA_BUDGET_ATTAIN"
  );

  return (
    <div className="space-y-6">

      {/* ── Header + Period Selector ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-head text-ev-black">Dashboard Ejecutivo</h1>
          <p className="text-xs font-body uppercase tracking-[0.1em] text-ev-gray3 mt-1">KPIs consolidados</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={period.slice(0, 7)}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const [y, m] = v.split("-").map(Number);
              const last = new Date(y, m, 0).getDate();
              setPeriod(`${v}-${String(last).padStart(2, "0")}`);
            }}
            className="border border-ev-gray6 px-3 py-1.5 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ev-black"
          />
          <a
            href={`/api/export/board-pack?period=${period}`}
            download
            className="border border-ev-gray6 px-3 py-1.5 text-sm font-body text-ev-gray3 hover:text-ev-black hover:border-ev-black transition-colors"
          >
            PDF ↓
          </a>
        </div>
      </div>

      {error && (
        <div className="border border-ev-red/30 bg-ev-beige1 px-4 py-3 text-sm text-ev-darkred font-body">{error}</div>
      )}

      {/* ── Bloque 1: Performance KPIs ── */}
      {kpisLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0,1,2,3].map((i) => <div key={i} className="border border-ev-gray7 bg-white p-5 h-28 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {FEATURED_CODES.map((code) => {
            const k = kpiMap[code];
            if (!k) return null;
            return (
              <ScenarioKpiCard
                key={code}
                label={k.label}
                value={k.value}
                format={k.format as "currency" | "percentage" | "number"}
                vsPriorPct={VS_PRIOR_MAP[code]  ? kpiMap[VS_PRIOR_MAP[code]]?.value  : undefined}
                vsBudgetPct={VS_BUDGET_MAP[code] ? kpiMap[VS_BUDGET_MAP[code]]?.value : undefined}
              />
            );
          })}
        </div>
      )}

      {/* Secondary KPIs if any (e.g. monthly metrics) */}
      {!kpisLoading && secondaryKpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {secondaryKpis.map((k) => (
            <ScenarioKpiCard
              key={k.code}
              label={k.label}
              value={k.value}
              format={k.format as "currency" | "percentage" | "number"}
            />
          ))}
        </div>
      )}

      {/* ── Bloque 2: Alertas + Calidad de datos ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AlertsPanel alerts={alerts} loading={alertsLoading} />

        <ClosureStatusPanel rows={control} loading={controlLoading} />
      </div>

      {/* ── Bloque 3: Ranking empresas ── */}
      <CompanyRanking rows={ranking} loading={rankingLoading} />

      {/* ── Bloque 4 & 5: Charts ── */}
      {chartsLoading ? (
        <div className="space-y-4">
          <div className="border border-ev-gray7 bg-white h-72 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-ev-gray7 bg-white h-72 animate-pulse" />
            <div className="border border-ev-gray7 bg-white h-72 animate-pulse" />
          </div>
        </div>
      ) : chartsData ? (
        <DashboardCharts {...chartsData} />
      ) : null}

    </div>
  );
}
