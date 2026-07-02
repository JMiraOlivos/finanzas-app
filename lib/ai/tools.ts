import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { fmtNum, fmtPct } from "./formatters";

// ── Tool definitions for Anthropic SDK ────────────────────────────────────

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_kpis",
    description: "Obtiene KPIs financieros consolidados YTD: ingresos, EBITDA, margen, resultado final, ratios RRHH y marketing. Incluye comparación vs presupuesto y año anterior.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_bullet_kpis",
    description: "Obtiene el cumplimiento YTD de ingresos y EBITDA por cada empresa (semáforo: red/yellow/green/blue). Útil para ver qué empresas están bajo presupuesto.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_variance_drivers",
    description: "Obtiene los principales drivers de desviación vs presupuesto o vs año anterior, desglosados por línea P&L y empresa. Útil para entender POR QUÉ hay desviaciones.",
    input_schema: {
      type: "object" as const,
      properties: {
        basis: {
          type: "string",
          enum: ["budget", "ly"],
          description: "Comparación: 'budget' (vs presupuesto) o 'ly' (vs año anterior). Default: budget.",
        },
        limit: {
          type: "number",
          description: "Cantidad de drivers a retornar por lado (positivos/negativos). Default: 8.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_data_quality",
    description: "Obtiene alertas de calidad de datos: empresas con cuentas sin mapear o descuadres contables. Útil para saber si los datos son confiables.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_comments",
    description: "Obtiene los comentarios financieros registrados por el equipo para el período analizado.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_period_closes",
    description: "Obtiene el estado de cierre contable de cada empresa (open/in_review/closed). Útil para saber si los datos están finalizados.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
];

// ── Tool execution ─────────────────────────────────────────────────────────

export type ToolContext = {
  period: string;
  effectiveIds: string[] | null;
  periodLabel: string;
};

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  try {
    switch (name) {
      case "get_kpis":            return await toolGetKpis(ctx);
      case "get_bullet_kpis":     return await toolGetBulletKpis(ctx);
      case "get_variance_drivers": return await toolGetVarianceDrivers(input, ctx);
      case "get_data_quality":    return await toolGetDataQuality(ctx);
      case "get_comments":        return await toolGetComments(ctx);
      case "get_period_closes":   return await toolGetPeriodCloses(ctx);
      default: return `Herramienta desconocida: ${name}`;
    }
  } catch (err) {
    return `Error al ejecutar ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── Individual tools ───────────────────────────────────────────────────────

async function toolGetKpis({ period, effectiveIds, periodLabel }: ToolContext): Promise<string> {
  const rows = effectiveIds === null
    ? await sql`
        WITH latest AS (SELECT MAX(period_month) AS pm FROM finanzas.fct_dashboard_kpis
                        WHERE period_month <= date_trunc('month', ${period}::date)::date)
        SELECT SUM(revenue_ytd) AS rev, SUM(ebitda_ytd) AS ebitda,
               SUM(resultado_ytd) AS res, SUM(rrhh_ytd) AS rrhh, SUM(mkt_ytd) AS mkt,
               SUM(revenue_ytd_prior) AS rev_ly, SUM(ebitda_ytd_prior) AS ebitda_ly,
               SUM(revenue_ytd_budget) AS rev_bud, SUM(ebitda_ytd_budget) AS ebitda_bud
        FROM finanzas.fct_dashboard_kpis CROSS JOIN latest WHERE period_month = latest.pm
      `
    : await sql`
        WITH latest AS (SELECT MAX(period_month) AS pm FROM finanzas.fct_dashboard_kpis
                        WHERE period_month <= date_trunc('month', ${period}::date)::date
                          AND company_id = ANY(${effectiveIds}::uuid[]))
        SELECT SUM(revenue_ytd) AS rev, SUM(ebitda_ytd) AS ebitda,
               SUM(resultado_ytd) AS res, SUM(rrhh_ytd) AS rrhh, SUM(mkt_ytd) AS mkt,
               SUM(revenue_ytd_prior) AS rev_ly, SUM(ebitda_ytd_prior) AS ebitda_ly,
               SUM(revenue_ytd_budget) AS rev_bud, SUM(ebitda_ytd_budget) AS ebitda_bud
        FROM finanzas.fct_dashboard_kpis CROSS JOIN latest
        WHERE period_month = latest.pm AND company_id = ANY(${effectiveIds}::uuid[])
      `;

  if (!rows[0]) return `Sin datos de KPIs para ${periodLabel}.`;
  const n = (v: unknown) => v !== null && v !== undefined ? Number(v) : null;
  const r = rows[0];
  const rev = n(r.rev), ebitda = n(r.ebitda), res = n(r.res), rrhh = n(r.rrhh), mkt = n(r.mkt);
  const revLy = n(r.rev_ly), ebitdaLy = n(r.ebitda_ly);
  const revBud = n(r.rev_bud), ebitdaBud = n(r.ebitda_bud);
  const pct = (a: number | null, b: number | null) => a !== null && b ? (a - b) / Math.abs(b) : null;
  const margin = rev && ebitda !== null ? ebitda / rev : null;

  const lines = [
    `KPIs CONSOLIDADOS — ${periodLabel}`,
    `Ingresos YTD:      ${fmtNum(rev)}  (vs ppto ${fmtPct(pct(rev, revBud))}, vs LY ${fmtPct(pct(rev, revLy))})`,
    `EBITDA YTD:        ${fmtNum(ebitda)}  (vs ppto ${fmtPct(pct(ebitda, ebitdaBud))}, vs LY ${fmtPct(pct(ebitda, ebitdaLy))})`,
    `Margen EBITDA:     ${fmtPct(margin)}`,
    `Resultado Final:   ${fmtNum(res)}`,
    `RRHH / Ingresos:   ${rev && rrhh !== null ? fmtPct(rrhh / rev) : "N/A"}`,
    `Mkt / Ingresos:    ${rev && mkt !== null ? fmtPct(mkt / rev) : "N/A"}`,
  ];
  return lines.join("\n");
}

async function toolGetBulletKpis({ period, effectiveIds, periodLabel }: ToolContext): Promise<string> {
  const rows = effectiveIds === null
    ? await sql`
        WITH latest AS (SELECT MAX(period_month) AS pm FROM finanzas.fct_company_bullet_kpis
                        WHERE period_month <= date_trunc('month', ${period}::date)::date)
        SELECT company_name, metric_code, actual_ytd, target_ytd, attainment_pct, status
        FROM finanzas.fct_company_bullet_kpis CROSS JOIN latest
        WHERE period_month = latest.pm
        ORDER BY company_name, sort_order
      `
    : await sql`
        WITH latest AS (SELECT MAX(period_month) AS pm FROM finanzas.fct_company_bullet_kpis
                        WHERE period_month <= date_trunc('month', ${period}::date)::date
                          AND company_id = ANY(${effectiveIds}::uuid[]))
        SELECT company_name, metric_code, actual_ytd, target_ytd, attainment_pct, status
        FROM finanzas.fct_company_bullet_kpis CROSS JOIN latest
        WHERE period_month = latest.pm AND company_id = ANY(${effectiveIds}::uuid[])
        ORDER BY company_name, sort_order
      `;

  if (!rows.length) return `Sin datos de cumplimiento por empresa para ${periodLabel}.`;
  const n = (v: unknown) => v !== null ? Number(v) : null;

  const byCompany = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const arr = byCompany.get(String(row.company_name)) ?? [];
    arr.push(row);
    byCompany.set(String(row.company_name), arr);
  }

  const lines = [`CUMPLIMIENTO POR EMPRESA — ${periodLabel}`];
  for (const [company, metrics] of byCompany) {
    const parts = metrics.map(m => {
      const label = String(m.metric_code) === "REVENUE_YTD" ? "Ingresos" : "EBITDA";
      return `${label}: ${fmtNum(n(m.actual_ytd))} (${fmtPct(n(m.attainment_pct))} ppto) [${m.status}]`;
    });
    lines.push(`${company}: ${parts.join(" | ")}`);
  }
  return lines.join("\n");
}

async function toolGetVarianceDrivers(
  input: Record<string, unknown>,
  { period, effectiveIds, periodLabel }: ToolContext
): Promise<string> {
  const basis  = (input.basis as string) === "ly" ? "ly" : "budget";
  const limit  = Math.min(Number(input.limit ?? 8), 15);
  const varCol = basis === "budget" ? "variance_vs_budget"     : "variance_vs_ly";
  const pctCol = basis === "budget" ? "variance_vs_budget_pct" : "variance_vs_ly_pct";
  const absCol = basis === "budget" ? "abs_impact_vs_budget"   : "abs_impact_vs_ly";
  const label  = basis === "budget" ? "vs Presupuesto"          : "vs Año Anterior";

  const rows = effectiveIds === null
    ? await sql`
        SELECT pnl_line_label, company_name,
               ${sql(varCol)} AS variance, ${sql(pctCol)} AS variance_pct
        FROM finanzas.fct_variance_drivers
        WHERE period_month = date_trunc('month', ${period}::date)::date
        ORDER BY ${sql(absCol)} DESC NULLS LAST
        LIMIT ${limit * 2}
      `
    : await sql`
        SELECT pnl_line_label, company_name,
               ${sql(varCol)} AS variance, ${sql(pctCol)} AS variance_pct
        FROM finanzas.fct_variance_drivers
        WHERE period_month = date_trunc('month', ${period}::date)::date
          AND company_id = ANY(${effectiveIds}::uuid[])
        ORDER BY ${sql(absCol)} DESC NULLS LAST
        LIMIT ${limit * 2}
      `;

  if (!rows.length) return `Sin drivers de desviación para ${periodLabel}.`;
  const n = (v: unknown) => Number(v ?? 0);

  const pos = rows.filter(r => n(r.variance) > 0).slice(0, limit);
  const neg = rows.filter(r => n(r.variance) < 0).slice(0, limit);

  const fmt = (r: (typeof rows)[0]) => {
    const v = n(r.variance);
    const sign = v >= 0 ? "+" : "";
    return `  ${r.pnl_line_label} | ${r.company_name}: ${sign}${fmtNum(v)} (${sign}${fmtPct(n(r.variance_pct))})`;
  };

  const lines = [`TOP DRIVERS ${label} — ${periodLabel}`];
  if (pos.length) { lines.push("FAVORABLES:"); pos.forEach(r => lines.push(fmt(r))); }
  if (neg.length) { lines.push("DESFAVORABLES:"); neg.forEach(r => lines.push(fmt(r))); }
  return lines.join("\n");
}

async function toolGetDataQuality({ period, effectiveIds, periodLabel }: ToolContext): Promise<string> {
  const rows = effectiveIds === null
    ? await sql`
        SELECT company_name, status, unmapped_account_count, unmapped_amount, imbalance
        FROM finanzas.dq_financial_control
        WHERE date_trunc('month', period_month) = date_trunc('month', ${period}::date)
        ORDER BY CASE status WHEN 'red' THEN 0 WHEN 'yellow' THEN 1 ELSE 2 END, company_name
      `
    : await sql`
        SELECT company_name, status, unmapped_account_count, unmapped_amount, imbalance
        FROM finanzas.dq_financial_control
        WHERE date_trunc('month', period_month) = date_trunc('month', ${period}::date)
          AND company_id = ANY(${effectiveIds}::uuid[])
        ORDER BY CASE status WHEN 'red' THEN 0 WHEN 'yellow' THEN 1 ELSE 2 END, company_name
      `;

  if (!rows.length) return `Sin datos de calidad para ${periodLabel}.`;
  const issues = rows.filter(r => r.status !== "green");
  if (!issues.length) return `CALIDAD DE DATOS — ${periodLabel}\nTodas las empresas tienen datos completos y sin descuadres. ✓`;

  const lines = [`CALIDAD DE DATOS — ${periodLabel}`];
  for (const r of rows) {
    const tag = r.status === "red" ? "[ERROR]" : r.status === "yellow" ? "[WARN]" : "[OK]";
    const parts: string[] = [];
    const unmapped = Number(r.unmapped_account_count ?? 0);
    const imbalance = Math.abs(Number(r.imbalance ?? 0));
    if (unmapped > 0) parts.push(`${unmapped} cuentas sin mapear`);
    if (imbalance > 1) parts.push(`descuadre ${fmtNum(imbalance)}`);
    lines.push(`${tag} ${r.company_name}${parts.length ? ": " + parts.join(", ") : ""}`);
  }
  return lines.join("\n");
}

async function toolGetComments({ period, effectiveIds, periodLabel }: ToolContext): Promise<string> {
  const monthStart = period.slice(0, 7) + "-01";
  const rows = effectiveIds === null
    ? await sql`
        SELECT fc.body, c.name AS company_name, fc.pnl_line_code, fc.created_at
        FROM finanzas.financial_comments fc
        LEFT JOIN finanzas.companies c ON c.id = fc.company_id
        WHERE fc.period_month = ${monthStart}::date
        ORDER BY fc.created_at DESC LIMIT 15
      `
    : await sql`
        SELECT fc.body, c.name AS company_name, fc.pnl_line_code, fc.created_at
        FROM finanzas.financial_comments fc
        LEFT JOIN finanzas.companies c ON c.id = fc.company_id
        WHERE fc.period_month = ${monthStart}::date
          AND (fc.company_id = ANY(${effectiveIds}::uuid[]) OR fc.company_id IS NULL)
        ORDER BY fc.created_at DESC LIMIT 15
      `;

  if (!rows.length) return `Sin comentarios registrados para ${periodLabel}.`;
  const lines = [`COMENTARIOS FINANCIEROS — ${periodLabel}`];
  for (const r of rows) {
    const scope = r.company_name ? `${r.company_name}${r.pnl_line_code ? ` / ${r.pnl_line_code}` : ""}` : "General";
    lines.push(`[${scope}]: "${r.body}"`);
  }
  return lines.join("\n");
}

async function toolGetPeriodCloses({ period, effectiveIds, periodLabel }: ToolContext): Promise<string> {
  const rows = effectiveIds === null
    ? await sql`
        SELECT c.name AS company_name, fpc.status, u.name AS closed_by_name, fpc.closed_at
        FROM finanzas.financial_period_closes fpc
        JOIN finanzas.companies c ON c.id = fpc.company_id
        LEFT JOIN finanzas.app_users u ON u.id = fpc.closed_by
        WHERE date_trunc('month', fpc.period_month) = date_trunc('month', ${period}::date)
        ORDER BY CASE fpc.status WHEN 'closed' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END, c.name
      `
    : await sql`
        SELECT c.name AS company_name, fpc.status, u.name AS closed_by_name, fpc.closed_at
        FROM finanzas.financial_period_closes fpc
        JOIN finanzas.companies c ON c.id = fpc.company_id
        LEFT JOIN finanzas.app_users u ON u.id = fpc.closed_by
        WHERE date_trunc('month', fpc.period_month) = date_trunc('month', ${period}::date)
          AND fpc.company_id = ANY(${effectiveIds}::uuid[])
        ORDER BY CASE fpc.status WHEN 'closed' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END, c.name
      `;

  if (!rows.length) return `Sin datos de cierre para ${periodLabel}.`;
  const lines = [`ESTADO DE CIERRES — ${periodLabel}`];
  for (const r of rows) {
    const who = r.closed_by_name ? ` (por ${r.closed_by_name})` : "";
    const STATUS = { closed: "✓ Cerrado", in_review: "⏳ En revisión", open: "○ Abierto" } as Record<string, string>;
    lines.push(`${r.company_name}: ${STATUS[String(r.status)] ?? r.status}${who}`);
  }
  return lines.join("\n");
}
