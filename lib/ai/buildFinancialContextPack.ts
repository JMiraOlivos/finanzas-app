import { sql } from "@/lib/db";
import { getAllowedCompanyIds } from "@/lib/permissions";
import type {
  FinancialContextPack,
  FinancialContextScope,
  KpiSummary,
  BulletKpiContext,
  VarianceDriverContext,
  DataQualityItem,
  CommentContext,
  PeriodCloseContext,
  DbtFreshnessContext,
} from "./types";

type BuildArgs = {
  userId: string;
  userRole: string;
  period: string;          // "YYYY-MM-DD"
  companyIds?: string[] | null;
  pnlLineCode?: string | null;
  metric?: string | null;
  comparisonMode?: "ly" | "budget" | "ly_budget" | null;
};

export async function buildFinancialContextPack(args: BuildArgs): Promise<FinancialContextPack> {
  const { userId, userRole, period, pnlLineCode, metric, comparisonMode } = args;

  // Resolve effective company scope
  const allowedIds = await getAllowedCompanyIds(userId, userRole);
  let effectiveIds: string[] | null = allowedIds;
  if (args.companyIds) {
    const req = args.companyIds;
    effectiveIds = allowedIds === null ? req : req.filter((id) => allowedIds.includes(id));
  }

  const n = (v: unknown): number | null =>
    v !== null && v !== undefined ? Number(v) : null;

  // All queries run in parallel — failures are caught individually
  const [kpiRaw, bulletRaw, driverBudgetRaw, driverLyRaw, dqRaw, commentsRaw, closesRaw, dbtRaw] =
    await Promise.all([
      fetchKpis(period, effectiveIds),
      fetchBullets(period, effectiveIds),
      fetchDrivers(period, effectiveIds, "budget"),
      fetchDrivers(period, effectiveIds, "ly"),
      fetchDataQuality(period, effectiveIds),
      fetchComments(period, effectiveIds, pnlLineCode ?? null),
      fetchPeriodCloses(period, effectiveIds),
      fetchDbtFreshness(),
    ]);

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const r = kpiRaw;
  const rev     = n(r?.revenue_ytd);
  const ebitda  = n(r?.ebitda_ytd);
  const res     = n(r?.resultado_ytd);
  const rrhh    = n(r?.rrhh_ytd);
  const mkt     = n(r?.mkt_ytd);
  const revPr   = n(r?.revenue_ytd_prior);
  const ebitPr  = n(r?.ebitda_ytd_prior);
  const revBud  = n(r?.revenue_ytd_budget);
  const ebitBud = n(r?.ebitda_ytd_budget);

  const pct = (a: number | null, b: number | null) =>
    a !== null && b ? (a - b) / Math.abs(b) : null;

  const kpis: KpiSummary[] = [
    { code: "REVENUE_YTD",     label: "Ingresos YTD",    value: rev,    format: "currency",    vsPriorPct: pct(rev,    revPr),  vsBudgetPct: pct(rev,    revBud)  },
    { code: "EBITDA_YTD",      label: "EBITDA YTD",      value: ebitda, format: "currency",    vsPriorPct: pct(ebitda, ebitPr), vsBudgetPct: pct(ebitda, ebitBud) },
    { code: "EBITDA_MARGIN",   label: "Margen EBITDA",   value: rev && ebitda !== null ? ebitda / rev : null, format: "percentage" },
    { code: "RESULTADO_FINAL", label: "Resultado Final", value: res,    format: "currency"   },
    { code: "RRHH_RATIO",      label: "RRHH / Ingresos", value: rev && rrhh !== null ? rrhh / rev : null, format: "percentage" },
    { code: "MKT_RATIO",       label: "Mkt / Ingresos",  value: rev && mkt  !== null ? mkt  / rev : null, format: "percentage" },
  ].filter((k) => !metric || k.code === metric || ["REVENUE_YTD", "EBITDA_YTD"].includes(k.code));

  // ── Bullets ───────────────────────────────────────────────────────────────

  const bullets: BulletKpiContext[] = bulletRaw.map((b) => ({
    companyId:           String(b.company_id),
    companyName:         String(b.company_name),
    metricCode:          b.metric_code as "REVENUE_YTD" | "EBITDA_YTD",
    actual:              n(b.actual_ytd),
    target:              n(b.target_ytd),
    ly:                  n(b.ly_ytd),
    attainmentPct:       n(b.attainment_pct),
    varianceVsTarget:    n(b.variance_vs_target),
    varianceVsTargetPct: n(b.variance_vs_target_pct),
    status:              b.status as BulletKpiContext["status"],
  }));

  // ── Drivers ───────────────────────────────────────────────────────────────

  const mapDrivers = (rows: Record<string, unknown>[], basis: "budget" | "ly"): VarianceDriverContext[] => {
    return rows.slice(0, 20).map((d) => ({
      pnlLineCode:          String(d.pnl_line_code),
      pnlLineLabel:         String(d.pnl_line_label),
      companyId:            String(d.company_id),
      companyName:          String(d.company_name),
      actual:               n(d.actual_ytd),
      budget:               n(d.budget_ytd),
      varianceVsBudget:     n(d.variance_vs_budget),
      varianceVsBudgetPct:  n(d.variance_vs_budget_pct),
      ly:                   n(d.ly_ytd),
      varianceVsLy:         n(d.variance_vs_ly),
      varianceVsLyPct:      n(d.variance_vs_ly_pct),
      basis,
    }));
  };

  const allDriversBudget = mapDrivers(driverBudgetRaw, "budget");
  const allDriversLy     = mapDrivers(driverLyRaw, "ly");

  const topDriversBudget = [
    ...allDriversBudget.filter((d) => (d.varianceVsBudget ?? 0) > 0).slice(0, 10),
    ...allDriversBudget.filter((d) => (d.varianceVsBudget ?? 0) < 0).slice(0, 10),
  ];
  const topDriversLy = [
    ...allDriversLy.filter((d) => (d.varianceVsLy ?? 0) > 0).slice(0, 10),
    ...allDriversLy.filter((d) => (d.varianceVsLy ?? 0) < 0).slice(0, 10),
  ];

  // ── Data quality ──────────────────────────────────────────────────────────

  const dataQuality: DataQualityItem[] = dqRaw
    .filter((d) => d.status === "yellow" || d.status === "red")
    .map((d) => ({
      companyId:   String(d.company_id),
      companyName: String(d.company_name),
      controlType: "financial_control",
      status:      d.status as "warning" | "error",
      message:     buildDqMessage(d),
    }));

  // ── Comments ──────────────────────────────────────────────────────────────

  const comments: CommentContext[] = commentsRaw.map((c) => ({
    id:          String(c.id),
    companyId:   c.company_id ? String(c.company_id) : null,
    pnlLineCode: c.pnl_line_code ? String(c.pnl_line_code) : null,
    body:        String(c.body ?? ""),
    createdAt:   String(c.created_at),
    source:      (c.source as string | undefined) ?? "manual",
  }));

  // ── Period closes ─────────────────────────────────────────────────────────

  const periodCloses: PeriodCloseContext[] = closesRaw.map((c) => ({
    companyId:   String(c.company_id),
    companyName: String(c.company_name),
    periodMonth: String(c.period_month),
    status:      String(c.status),
    closedBy:    c.closed_by_name ? String(c.closed_by_name) : null,
    closedAt:    c.closed_at ? String(c.closed_at) : null,
  }));

  // ── dbt freshness ─────────────────────────────────────────────────────────

  let dbtFreshness: DbtFreshnessContext | null = null;
  if (dbtRaw) {
    const completedAt  = dbtRaw.completed_at  ? String(dbtRaw.completed_at)  : null;
    const triggeredAt  = dbtRaw.triggered_at  ? String(dbtRaw.triggered_at)  : null;
    const refTime      = completedAt ?? triggeredAt;
    const ageMinutes   = refTime
      ? Math.round((Date.now() - new Date(refTime).getTime()) / 60_000)
      : null;
    dbtFreshness = {
      status:       String(dbtRaw.status),
      triggeredAt,
      completedAt,
      errorMessage: dbtRaw.error_message ? String(dbtRaw.error_message) : null,
      ageMinutes,
    };
  }

  // ── Scope ─────────────────────────────────────────────────────────────────

  const scope: FinancialContextScope = {
    period,
    companyIds: effectiveIds,
    requestedMetric:   metric    ?? null,
    requestedPnlLine:  pnlLineCode ?? null,
    comparisonMode:    comparisonMode ?? null,
  };

  return {
    scope,
    kpis,
    bullets,
    topDriversBudget,
    topDriversLy,
    dataQuality,
    comments,
    periodCloses,
    dbtFreshness,
    generatedAt: new Date().toISOString(),
  };
}

// ── Query helpers ─────────────────────────────────────────────────────────

async function fetchKpis(period: string, ids: string[] | null) {
  try {
    const rows = ids === null
      ? await sql`
          WITH latest AS (
            SELECT MAX(period_month) AS pm
            FROM finanzas.fct_dashboard_kpis
            WHERE period_month <= date_trunc('month', ${period}::date)::date
          )
          SELECT revenue_ytd, ebitda_ytd, resultado_ytd, rrhh_ytd, mkt_ytd,
                 revenue_ytd_prior, ebitda_ytd_prior,
                 revenue_ytd_budget, ebitda_ytd_budget
          FROM finanzas.fct_dashboard_kpis CROSS JOIN latest
          WHERE period_month = latest.pm
        `
      : await sql`
          WITH latest AS (
            SELECT MAX(period_month) AS pm
            FROM finanzas.fct_dashboard_kpis
            WHERE period_month <= date_trunc('month', ${period}::date)::date
              AND company_id = ANY(${ids}::uuid[])
          )
          SELECT SUM(revenue_ytd) AS revenue_ytd, SUM(ebitda_ytd) AS ebitda_ytd,
                 SUM(resultado_ytd) AS resultado_ytd, SUM(rrhh_ytd) AS rrhh_ytd,
                 SUM(mkt_ytd) AS mkt_ytd, SUM(revenue_ytd_prior) AS revenue_ytd_prior,
                 SUM(ebitda_ytd_prior) AS ebitda_ytd_prior,
                 SUM(revenue_ytd_budget) AS revenue_ytd_budget,
                 SUM(ebitda_ytd_budget) AS ebitda_ytd_budget
          FROM finanzas.fct_dashboard_kpis CROSS JOIN latest
          WHERE period_month = latest.pm AND company_id = ANY(${ids}::uuid[])
        `;
    return rows[0] ?? null;
  } catch { return null; }
}

async function fetchBullets(period: string, ids: string[] | null) {
  try {
    return ids === null
      ? await sql`
          WITH latest AS (
            SELECT MAX(period_month) AS pm
            FROM finanzas.fct_company_bullet_kpis
            WHERE period_month <= date_trunc('month', ${period}::date)::date
          )
          SELECT company_id, company_name, metric_code,
                 actual_ytd, target_ytd, ly_ytd, attainment_pct,
                 variance_vs_target, variance_vs_target_pct, status
          FROM finanzas.fct_company_bullet_kpis CROSS JOIN latest
          WHERE period_month = latest.pm
          ORDER BY company_name, sort_order
        `
      : await sql`
          WITH latest AS (
            SELECT MAX(period_month) AS pm
            FROM finanzas.fct_company_bullet_kpis
            WHERE period_month <= date_trunc('month', ${period}::date)::date
              AND company_id = ANY(${ids}::uuid[])
          )
          SELECT company_id, company_name, metric_code,
                 actual_ytd, target_ytd, ly_ytd, attainment_pct,
                 variance_vs_target, variance_vs_target_pct, status
          FROM finanzas.fct_company_bullet_kpis CROSS JOIN latest
          WHERE period_month = latest.pm AND company_id = ANY(${ids}::uuid[])
          ORDER BY company_name, sort_order
        `;
  } catch { return []; }
}

async function fetchDrivers(period: string, ids: string[] | null, basis: "budget" | "ly") {
  try {
    const absCol = basis === "budget" ? "abs_impact_vs_budget" : "abs_impact_vs_ly";
    return ids === null
      ? await sql`
          SELECT pnl_line_code, pnl_line_label,
                 company_id, company_name,
                 actual_ytd, budget_ytd, ly_ytd,
                 variance_vs_budget, variance_vs_budget_pct,
                 variance_vs_ly, variance_vs_ly_pct
          FROM finanzas.fct_variance_drivers
          WHERE period_month = date_trunc('month', ${period}::date)::date
          ORDER BY ${sql(absCol)} DESC NULLS LAST
          LIMIT 40
        `
      : await sql`
          SELECT pnl_line_code, pnl_line_label,
                 company_id, company_name,
                 actual_ytd, budget_ytd, ly_ytd,
                 variance_vs_budget, variance_vs_budget_pct,
                 variance_vs_ly, variance_vs_ly_pct
          FROM finanzas.fct_variance_drivers
          WHERE period_month = date_trunc('month', ${period}::date)::date
            AND company_id = ANY(${ids}::uuid[])
          ORDER BY ${sql(absCol)} DESC NULLS LAST
          LIMIT 40
        `;
  } catch { return []; }
}

async function fetchDataQuality(period: string, ids: string[] | null) {
  try {
    return ids === null
      ? await sql`
          SELECT company_id, company_name, status,
                 unmapped_account_count, unmapped_amount, imbalance
          FROM finanzas.dq_financial_control
          WHERE date_trunc('month', period_month) = date_trunc('month', ${period}::date)
            AND status IN ('yellow', 'red')
          ORDER BY CASE status WHEN 'red' THEN 0 ELSE 1 END, company_name
        `
      : await sql`
          SELECT company_id, company_name, status,
                 unmapped_account_count, unmapped_amount, imbalance
          FROM finanzas.dq_financial_control
          WHERE date_trunc('month', period_month) = date_trunc('month', ${period}::date)
            AND company_id = ANY(${ids}::uuid[])
            AND status IN ('yellow', 'red')
          ORDER BY CASE status WHEN 'red' THEN 0 ELSE 1 END, company_name
        `;
  } catch { return []; }
}

async function fetchComments(period: string, ids: string[] | null, pnlLineCode: string | null) {
  try {
    const monthStart = period.slice(0, 7) + "-01";
    return ids === null
      ? await sql`
          SELECT id, company_id, pnl_line_code, comment AS body,
                 COALESCE(source, 'manual') AS source, created_at
          FROM finanzas.financial_comments
          WHERE period_month = ${monthStart}::date
            AND (${pnlLineCode}::text IS NULL OR pnl_line_code = ${pnlLineCode ?? ""})
            AND status IN ('draft', 'approved')
          ORDER BY created_at DESC
          LIMIT 20
        `
      : await sql`
          SELECT id, company_id, pnl_line_code, comment AS body,
                 COALESCE(source, 'manual') AS source, created_at
          FROM finanzas.financial_comments
          WHERE period_month = ${monthStart}::date
            AND (company_id = ANY(${ids}::uuid[]) OR company_id IS NULL)
            AND (${pnlLineCode}::text IS NULL OR pnl_line_code = ${pnlLineCode ?? ""})
            AND status IN ('draft', 'approved')
          ORDER BY created_at DESC
          LIMIT 20
        `;
  } catch { return []; }
}

async function fetchPeriodCloses(period: string, ids: string[] | null) {
  try {
    return ids === null
      ? await sql`
          SELECT fpc.company_id, c.name AS company_name,
                 fpc.period_month, fpc.status,
                 u.name AS closed_by_name, fpc.closed_at
          FROM finanzas.financial_period_closes fpc
          JOIN finanzas.companies c ON c.id = fpc.company_id
          LEFT JOIN finanzas.app_users u ON u.id = fpc.closed_by
          WHERE date_trunc('month', fpc.period_month) = date_trunc('month', ${period}::date)
          ORDER BY c.name
        `
      : await sql`
          SELECT fpc.company_id, c.name AS company_name,
                 fpc.period_month, fpc.status,
                 u.name AS closed_by_name, fpc.closed_at
          FROM finanzas.financial_period_closes fpc
          JOIN finanzas.companies c ON c.id = fpc.company_id
          LEFT JOIN finanzas.app_users u ON u.id = fpc.closed_by
          WHERE date_trunc('month', fpc.period_month) = date_trunc('month', ${period}::date)
            AND fpc.company_id = ANY(${ids}::uuid[])
          ORDER BY c.name
        `;
  } catch { return []; }
}

async function fetchDbtFreshness() {
  try {
    const rows = await sql`
      SELECT status, triggered_at, completed_at, error_message
      FROM finanzas.dbt_run_history
      ORDER BY triggered_at DESC NULLS LAST
      LIMIT 1
    `;
    return rows[0] ?? null;
  } catch { return null; }
}

function buildDqMessage(d: Record<string, unknown>): string {
  const parts: string[] = [];
  const unmapped = Number(d.unmapped_account_count ?? 0);
  const imbalance = Number(d.imbalance ?? 0);
  if (unmapped > 0) parts.push(`${unmapped} cuentas sin mapear`);
  if (Math.abs(imbalance) > 1) parts.push(`descuadre $${Math.round(imbalance).toLocaleString()}`);
  return parts.join("; ") || "alerta de calidad";
}
