// AI context formatters — raw numbers and compact representations for prompt context.
// These are distinct from lib/formatters.ts which formats for UI display.

import type {
  KpiSummary,
  BulletKpiContext,
  VarianceDriverContext,
  DataQualityItem,
  DbtFreshnessContext,
} from "./types";

export function fmtNum(v: number | null | undefined): string {
  if (v == null) return "N/A";
  return v.toLocaleString("es-CL", { maximumFractionDigits: 0 });
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null) return "N/A";
  return `${(v * 100).toFixed(1)}%`;
}

export function summarizeKpis(kpis: KpiSummary[]): string {
  return kpis
    .map((k) => {
      const parts = [`${k.label}: ${fmtNum(k.value)}`];
      if (k.vsBudgetPct != null) parts.push(`vs ppto ${fmtPct(k.vsBudgetPct)}`);
      if (k.vsPriorPct  != null) parts.push(`vs LY ${fmtPct(k.vsPriorPct)}`);
      return parts.join(" | ");
    })
    .join("\n");
}

export function summarizeBullets(bullets: BulletKpiContext[]): string {
  const byCompany = new Map<string, BulletKpiContext[]>();
  for (const b of bullets) {
    const arr = byCompany.get(b.companyName) ?? [];
    arr.push(b);
    byCompany.set(b.companyName, arr);
  }
  const lines: string[] = [];
  for (const [company, rows] of byCompany) {
    const parts = rows.map(
      (r) => `${r.metricCode === "REVENUE_YTD" ? "Ingresos" : "EBITDA"}: ${fmtNum(r.actual)} (${fmtPct(r.attainmentPct)} ppto) [${r.status}]`
    );
    lines.push(`${company}: ${parts.join(" | ")}`);
  }
  return lines.join("\n");
}

export function summarizeDrivers(drivers: VarianceDriverContext[], basis: "budget" | "ly"): string {
  return drivers
    .slice(0, 20)
    .map((d) => {
      const variance = basis === "budget" ? d.varianceVsBudget : d.varianceVsLy;
      const pct      = basis === "budget" ? d.varianceVsBudgetPct : d.varianceVsLyPct;
      const sign     = (variance ?? 0) >= 0 ? "+" : "";
      return `${d.pnlLineLabel} | ${d.companyName}: ${sign}${fmtNum(variance)} (${sign}${fmtPct(pct)})`;
    })
    .join("\n");
}

export function summarizeDataQuality(items: DataQualityItem[]): string {
  if (items.length === 0) return "Sin alertas de calidad de datos.";
  return items
    .map((i) => `[${i.status.toUpperCase()}] ${i.companyName} — ${i.controlType}: ${i.message ?? "sin detalle"}`)
    .join("\n");
}

export function summarizeFreshness(f: DbtFreshnessContext | null): string {
  if (!f) return "Estado dbt desconocido.";
  const age = f.ageMinutes != null ? `hace ${f.ageMinutes} min` : "timestamp desconocido";
  if (f.status === "completed") return `Marts actualizados ${age}. Estado: OK.`;
  if (f.status === "failed")    return `ALERTA: último refresh dbt FALLÓ (${age}). ${f.errorMessage ?? ""}`;
  if (f.status === "triggered") return `Refresh dbt en progreso (iniciado ${age}).`;
  return `Estado dbt: ${f.status} (${age}).`;
}
