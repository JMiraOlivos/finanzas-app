"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { ScenarioKpiCard } from "@/components/dashboard/ScenarioKpiCard";
import { AlertsPanel, type Alert } from "@/components/dashboard/AlertsPanel";
import { ClosureStatusPanel, type ControlRow } from "@/components/dashboard/ClosureStatusPanel";
import { CompanyRanking, type CompanyRankingRow } from "@/components/dashboard/CompanyRanking";
import { ActiveFiltersBar } from "@/components/dashboard/ActiveFiltersBar";
import { VarianceDriversPanel } from "@/components/dashboard/VarianceDriversPanel";
import { CompanyBulletGrid } from "@/components/dashboard/CompanyBulletGrid";
import { DataFreshnessBadge } from "@/components/dashboard/DataFreshnessBadge";
import { AiExecutiveSummaryPanel } from "@/components/ai/AiExecutiveSummaryPanel";
import { ExplainButton } from "@/components/ai/ExplainButton";
import type { ChartsData } from "@/components/dashboard/DashboardCharts";
import type { CurrencyUnit } from "@/lib/formatters";

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

function DashboardContent() {
  const router     = useRouter();
  const pathname   = usePathname();
  const sp         = useSearchParams();

  const periodParam    = sp.get("period");
  const companyIdParam = sp.get("companyId");
  const metricParam    = sp.get("metric");

  const [period, setPeriodState] = useState(periodParam ?? defaultPeriod());
  const [unit,   setUnit]        = useState<CurrencyUnit>("millions");

  const [kpis,           setKpis]           = useState<KpiMetric[]>([]);
  const [chartsData,     setChartsData]     = useState<ChartsData | null>(null);
  const [ranking,        setRanking]        = useState<CompanyRankingRow[]>([]);
  const [alerts,         setAlerts]         = useState<Alert[]>([]);
  const [control,        setControl]        = useState<ControlRow[]>([]);
  const [kpisLoading,    setKpisLoading]    = useState(true);
  const [chartsLoading,  setChartsLoading]  = useState(true);
  const [rankingLoading, setRankingLoading] = useState(true);
  const [alertsLoading,  setAlertsLoading]  = useState(true);
  const [controlLoading, setControlLoading] = useState(true);
  const [error,          setError]          = useState<string | null>(null);

  function setFilter(key: string, value: string | null) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  function setPeriod(p: string) {
    setPeriodState(p);
    setFilter("period", p);
  }

  function clearFilters() {
    const params = new URLSearchParams();
    if (period !== defaultPeriod()) params.set("period", period);
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }

  const companyIdsParam = companyIdParam ?? undefined;

  const fetchKpis = useCallback(() => {
    setKpisLoading(true);
    setError(null);
    const qs = new URLSearchParams({ period });
    if (companyIdsParam) qs.set("companyIds", companyIdsParam);
    fetch(`/api/dashboard?${qs}`)
      .then((r) => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json() as Promise<KpiMetric[]>; })
      .then(setKpis)
      .catch((e: Error) => setError(e.message))
      .finally(() => setKpisLoading(false));
  }, [period, companyIdsParam]);

  const fetchCharts = useCallback(() => {
    setChartsLoading(true);
    const qs = new URLSearchParams({ period });
    if (companyIdsParam) qs.set("companyIds", companyIdsParam);
    fetch(`/api/dashboard/charts?${qs}`)
      .then((r) => r.json() as Promise<ChartsData>)
      .then(setChartsData)
      .catch(() => {})
      .finally(() => setChartsLoading(false));
  }, [period, companyIdsParam]);

  const fetchRanking = useCallback(() => {
    setRankingLoading(true);
    const qs = new URLSearchParams({ period });
    if (companyIdsParam) qs.set("companyIds", companyIdsParam);
    fetch(`/api/dashboard/ranking?${qs}`)
      .then((r) => r.json() as Promise<CompanyRankingRow[]>)
      .then(setRanking)
      .catch(() => {})
      .finally(() => setRankingLoading(false));
  }, [period, companyIdsParam]);

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

  const secondaryKpis = kpis.filter(
    (k) => !FEATURED_CODES.includes(k.code) &&
            !Object.values(VS_PRIOR_MAP).includes(k.code) &&
            !Object.values(VS_BUDGET_MAP).includes(k.code) &&
            k.code !== "EBITDA_BUDGET_ATTAIN"
  );

  const activeCompanyName = ranking.find((r) => r.companyId === companyIdParam)?.companyName ?? null;
  const activeMetricLabel = metricParam ? (kpiMap[metricParam]?.label ?? null) : null;

  return (
    <div className="space-y-6">

      {/* ── Header + Period Selector ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-head text-ev-black">Dashboard Ejecutivo</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs font-body uppercase tracking-[0.1em] text-ev-gray3">KPIs consolidados</p>
            <DataFreshnessBadge />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Currency unit toggle */}
          <div className="flex border border-ev-gray6 overflow-hidden text-xs">
            {([ ["millions", "MM"], ["thousands", "M"], ["full", "#"] ] as [CurrencyUnit, string][]).map(([u, label], i) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={[
                  "px-2.5 py-1.5 font-body font-medium",
                  i > 0 ? "border-l border-ev-gray6" : "",
                  unit === u ? "bg-ev-black text-white" : "bg-white text-ev-gray3 hover:bg-ev-beige2 hover:text-ev-black",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
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

      {/* ── Active Filters Bar ── */}
      <ActiveFiltersBar
        companyName={activeCompanyName}
        metricLabel={activeMetricLabel}
        onClear={clearFilters}
      />

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
                unit={unit}
                vsPriorPct={VS_PRIOR_MAP[code]  ? kpiMap[VS_PRIOR_MAP[code]]?.value  : undefined}
                vsBudgetPct={VS_BUDGET_MAP[code] ? kpiMap[VS_BUDGET_MAP[code]]?.value : undefined}
                isActive={metricParam === code}
                onClick={() => setFilter("metric", metricParam === code ? null : code)}
                actions={(code === "REVENUE_YTD" || code === "EBITDA_YTD") ? (
                  <ExplainButton
                    period={period}
                    companyIds={companyIdParam}
                    targetType="kpi"
                    metricCode={code}
                  />
                ) : undefined}
              />
            );
          })}
        </div>
      )}

      {/* Secondary KPIs if any */}
      {!kpisLoading && secondaryKpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {secondaryKpis.map((k) => (
            <ScenarioKpiCard
              key={k.code}
              label={k.label}
              value={k.value}
              format={k.format as "currency" | "percentage" | "number"}
              unit={unit}
            />
          ))}
        </div>
      )}

      {/* ── Bullet Charts: cumplimiento por empresa ── */}
      <CompanyBulletGrid
        period={period}
        companyIds={companyIdParam}
        unit={unit}
        onCompanyClick={(id) => setFilter("companyId", companyIdParam === id ? null : id)}
        activeCompanyId={companyIdParam}
      />

      {/* ── Análisis ejecutivo IA ── */}
      <AiExecutiveSummaryPanel period={period} companyIds={companyIdParam} />

      {/* ── Bloque 2: Alertas + Calidad de datos ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AlertsPanel alerts={alerts} loading={alertsLoading} />
        <ClosureStatusPanel rows={control} loading={controlLoading} />
      </div>

      {/* ── Bloque 3: Ranking empresas ── */}
      <CompanyRanking
        rows={ranking}
        loading={rankingLoading}
        unit={unit}
        activeCompanyId={companyIdParam}
        onCompanyClick={(id) => setFilter("companyId", companyIdParam === id ? null : id)}
      />

      {/* ── Bloque 4: Variance Drivers ── */}
      <VarianceDriversPanel period={period} companyIds={companyIdParam} unit={unit} />

      {/* ── Bloque 5 & 6: Charts ── */}
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

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6 animate-pulse">
        <div className="h-10 bg-neutral-100 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0,1,2,3].map((i) => <div key={i} className="border border-ev-gray7 bg-white p-5 h-28" />)}
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
