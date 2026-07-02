import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAllowedCompanyIds } from "@/lib/permissions";

export type CompanyBulletKpi = {
  companyId: string;
  companyName: string;
  periodMonth: string;
  metricCode: "REVENUE_YTD" | "EBITDA_YTD";
  metricLabel: string;
  actual: number | null;
  target: number | null;
  ly: number | null;
  varianceVsTarget: number | null;
  varianceVsTargetPct: number | null;
  attainmentPct: number | null;
  varianceVsLy: number | null;
  varianceVsLyPct: number | null;
  status: "red" | "yellow" | "green" | "blue" | "gray";
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");
  const rawIds = searchParams.get("companyIds");
  const metric = searchParams.get("metric"); // REVENUE_YTD | EBITDA_YTD | all | null

  if (!period) return NextResponse.json({ error: "Missing period" }, { status: 400 });

  const allowedIds = await getAllowedCompanyIds(user.id, user.role);

  let companyIds: string[] | null = allowedIds;
  if (rawIds) {
    const requested = rawIds.split(",").map((s) => s.trim()).filter(Boolean);
    companyIds = allowedIds === null ? requested : requested.filter((id) => allowedIds.includes(id));
  }

  const n = (v: unknown) => (v !== null && v !== undefined ? Number(v) : null);

  const rows = companyIds === null
    ? await sql`
        WITH latest AS (
          SELECT MAX(period_month) AS pm
          FROM finanzas.fct_company_bullet_kpis
          WHERE period_month <= date_trunc('month', ${period}::date)::date
        )
        SELECT
          company_id, company_name, period_month,
          metric_code, metric_label,
          actual_ytd, target_ytd, ly_ytd,
          variance_vs_target, variance_vs_target_pct, attainment_pct,
          variance_vs_ly, variance_vs_ly_pct,
          status
        FROM finanzas.fct_company_bullet_kpis
        CROSS JOIN latest
        WHERE period_month = latest.pm
        ORDER BY company_name, sort_order
      `
    : await sql`
        WITH latest AS (
          SELECT MAX(period_month) AS pm
          FROM finanzas.fct_company_bullet_kpis
          WHERE period_month <= date_trunc('month', ${period}::date)::date
            AND company_id = ANY(${companyIds}::uuid[])
        )
        SELECT
          company_id, company_name, period_month,
          metric_code, metric_label,
          actual_ytd, target_ytd, ly_ytd,
          variance_vs_target, variance_vs_target_pct, attainment_pct,
          variance_vs_ly, variance_vs_ly_pct,
          status
        FROM finanzas.fct_company_bullet_kpis
        CROSS JOIN latest
        WHERE period_month = latest.pm
          AND company_id = ANY(${companyIds}::uuid[])
        ORDER BY company_name, sort_order
      `;

  const metricFilter = metric && metric !== "all" ? metric : null;

  const result: CompanyBulletKpi[] = rows
    .filter((r) => !metricFilter || r.metric_code === metricFilter)
    .map((r) => ({
      companyId:           String(r.company_id),
      companyName:         String(r.company_name),
      periodMonth:         String(r.period_month),
      metricCode:          r.metric_code as "REVENUE_YTD" | "EBITDA_YTD",
      metricLabel:         String(r.metric_label),
      actual:              n(r.actual_ytd),
      target:              n(r.target_ytd),
      ly:                  n(r.ly_ytd),
      varianceVsTarget:    n(r.variance_vs_target),
      varianceVsTargetPct: n(r.variance_vs_target_pct),
      attainmentPct:       n(r.attainment_pct),
      varianceVsLy:        n(r.variance_vs_ly),
      varianceVsLyPct:     n(r.variance_vs_ly_pct),
      status:              r.status as "red" | "yellow" | "green" | "blue" | "gray",
    }));

  // Consolidated "Total Grupo" rows — only when there are multiple companies
  const uniqueCompanies = new Set(result.map((r) => r.companyId));
  if (uniqueCompanies.size > 1) {
    const metricCodes: Array<"REVENUE_YTD" | "EBITDA_YTD"> = ["REVENUE_YTD", "EBITDA_YTD"];
    const totalRows: CompanyBulletKpi[] = metricCodes.flatMap((code) => {
      const subset = result.filter((r) => r.metricCode === code);
      if (subset.length === 0) return [];

      const actual      = subset.reduce((s, r) => s + (r.actual  ?? 0), 0);
      const target      = subset.some((r) => r.target !== null)
        ? subset.reduce((s, r) => s + (r.target ?? 0), 0) : null;
      const ly          = subset.some((r) => r.ly !== null)
        ? subset.reduce((s, r) => s + (r.ly ?? 0), 0)     : null;

      const varianceVsTarget    = target !== null ? actual - target : null;
      const varianceVsTargetPct = target          ? (actual - target) / Math.abs(target) : null;
      const attainmentPct       = target          ? actual / target : null;
      const varianceVsLy        = ly !== null     ? actual - ly : null;
      const varianceVsLyPct     = ly              ? (actual - ly) / Math.abs(ly) : null;

      let status: CompanyBulletKpi["status"] = "gray";
      if (attainmentPct !== null && target !== null && target > 0) {
        const [t1, t2, t3] = code === "EBITDA_YTD" ? [0.75, 0.95, 1.05] : [0.80, 0.95, 1.05];
        if      (attainmentPct < t1) status = "red";
        else if (attainmentPct < t2) status = "yellow";
        else if (attainmentPct <= t3) status = "green";
        else                          status = "blue";
      }

      return [{
        companyId: "__total__", companyName: "Total Grupo",
        periodMonth: subset[0].periodMonth, metricCode: code,
        metricLabel: subset[0].metricLabel,
        actual, target, ly,
        varianceVsTarget, varianceVsTargetPct, attainmentPct,
        varianceVsLy, varianceVsLyPct, status,
      }];
    });

    return NextResponse.json([...totalRows, ...result]);
  }

  return NextResponse.json(result);
}
