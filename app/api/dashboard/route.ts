import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAllowedCompanyIds } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");
  if (!period) return NextResponse.json({ error: "Missing period" }, { status: 400 });

  const allowedIds = await getAllowedCompanyIds(user.id, user.role);

  // Use the latest available period ≤ requested (matches fn_pnl_ytd semantics:
  // if Jun has no uploads yet, show YTD through May instead of empty)
  const rows = allowedIds === null
    ? await sql`
        WITH latest AS (
          SELECT MAX(period_month) AS pm
          FROM finanzas.fct_dashboard_kpis
          WHERE period_month <= date_trunc('month', ${period}::date)::date
        )
        SELECT
          SUM(revenue_ytd)        AS revenue_ytd,
          SUM(ebitda_ytd)         AS ebitda_ytd,
          SUM(resultado_ytd)      AS resultado_ytd,
          SUM(rrhh_ytd)           AS rrhh_ytd,
          SUM(mkt_ytd)            AS mkt_ytd,
          SUM(revenue_ytd_prior)  AS revenue_ytd_prior,
          SUM(ebitda_ytd_prior)   AS ebitda_ytd_prior,
          SUM(revenue_ytd_budget) AS revenue_ytd_budget,
          SUM(ebitda_ytd_budget)  AS ebitda_ytd_budget
        FROM finanzas.fct_dashboard_kpis
        CROSS JOIN latest
        WHERE period_month = latest.pm
      `
    : await sql`
        WITH latest AS (
          SELECT MAX(period_month) AS pm
          FROM finanzas.fct_dashboard_kpis
          WHERE period_month <= date_trunc('month', ${period}::date)::date
        )
        SELECT
          SUM(revenue_ytd)        AS revenue_ytd,
          SUM(ebitda_ytd)         AS ebitda_ytd,
          SUM(resultado_ytd)      AS resultado_ytd,
          SUM(rrhh_ytd)           AS rrhh_ytd,
          SUM(mkt_ytd)            AS mkt_ytd,
          SUM(revenue_ytd_prior)  AS revenue_ytd_prior,
          SUM(ebitda_ytd_prior)   AS ebitda_ytd_prior,
          SUM(revenue_ytd_budget) AS revenue_ytd_budget,
          SUM(ebitda_ytd_budget)  AS ebitda_ytd_budget
        FROM finanzas.fct_dashboard_kpis
        CROSS JOIN latest
        WHERE period_month = latest.pm
          AND company_id = ANY(${allowedIds}::uuid[])
      `;

  if (!rows[0]) return NextResponse.json([]);

  const r = rows[0];
  const n = (v: unknown) => (v !== null && v !== undefined ? Number(v) : null);

  const rev      = n(r.revenue_ytd);
  const ebitda   = n(r.ebitda_ytd);
  const res      = n(r.resultado_ytd);
  const rrhh     = n(r.rrhh_ytd);
  const mkt      = n(r.mkt_ytd);
  const revPr    = n(r.revenue_ytd_prior);
  const ebitPr   = n(r.ebitda_ytd_prior);
  const revBud   = n(r.revenue_ytd_budget);
  const ebitBud  = n(r.ebitda_ytd_budget);

  const pct = (a: number | null, b: number | null) =>
    a !== null && b ? (a - b) / Math.abs(b) : null;

  const metrics = [
    { code: "REVENUE_YTD",           label: "Ingresos YTD",         value: rev,                                    format: "currency"   },
    { code: "EBITDA_YTD",            label: "EBITDA YTD",           value: ebitda,                                 format: "currency"   },
    { code: "EBITDA_MARGIN",         label: "Margen EBITDA",        value: rev && ebitda !== null ? ebitda / rev : null, format: "percentage" },
    { code: "RESULTADO_FINAL",       label: "Resultado Final",      value: res,                                    format: "currency"   },
    { code: "RRHH_RATIO",            label: "RRHH / Ingresos",      value: rev && rrhh !== null ? rrhh / rev : null,    format: "percentage" },
    { code: "MKT_RATIO",             label: "Marketing / Ingresos", value: rev && mkt !== null ? mkt / rev : null,      format: "percentage" },
    { code: "REVENUE_VS_PRIOR_PCT",  label: "Ingresos vs año ant.", value: pct(rev, revPr),                        format: "percentage" },
    { code: "EBITDA_VS_PRIOR_PCT",   label: "EBITDA vs año ant.",   value: pct(ebitda, ebitPr),                    format: "percentage" },
    { code: "REVENUE_VS_BUDGET_PCT", label: "Ingresos vs ppto.",    value: pct(rev, revBud),                       format: "percentage" },
    { code: "EBITDA_VS_BUDGET_PCT",  label: "EBITDA vs ppto.",      value: pct(ebitda, ebitBud),                   format: "percentage" },
    { code: "EBITDA_BUDGET_ATTAIN",  label: "Cumpl. ppto. EBITDA", value: ebitda !== null && ebitBud ? ebitda / ebitBud : null, format: "percentage" },
  ];

  return NextResponse.json(metrics);
}
