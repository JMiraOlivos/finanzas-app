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
  const rawIds = searchParams.get("companyIds");
  if (!period) return NextResponse.json({ error: "Missing period" }, { status: 400 });

  const allowedIds = await getAllowedCompanyIds(user.id, user.role);

  let companyIds: string[] | null = allowedIds;
  if (rawIds) {
    const requested = rawIds.split(",").map((s) => s.trim()).filter(Boolean);
    companyIds = allowedIds === null ? requested : requested.filter((id) => allowedIds.includes(id));
  }

  const rows = companyIds === null
    ? await sql`
        WITH latest AS (
          SELECT MAX(period_month) AS pm
          FROM finanzas.fct_dashboard_kpis
          WHERE period_month <= date_trunc('month', ${period}::date)::date
        )
        SELECT company_id, company_name,
               revenue_ytd, ebitda_ytd, resultado_ytd,
               revenue_ytd_prior, ebitda_ytd_prior
        FROM finanzas.fct_dashboard_kpis
        CROSS JOIN latest
        WHERE period_month = latest.pm
        ORDER BY revenue_ytd DESC NULLS LAST
      `
    : await sql`
        WITH latest AS (
          SELECT MAX(period_month) AS pm
          FROM finanzas.fct_dashboard_kpis
          WHERE period_month <= date_trunc('month', ${period}::date)::date
            AND company_id = ANY(${companyIds}::uuid[])
        )
        SELECT company_id, company_name,
               revenue_ytd, ebitda_ytd, resultado_ytd,
               revenue_ytd_prior, ebitda_ytd_prior
        FROM finanzas.fct_dashboard_kpis
        CROSS JOIN latest
        WHERE period_month = latest.pm
          AND company_id = ANY(${companyIds}::uuid[])
        ORDER BY revenue_ytd DESC NULLS LAST
      `;

  const n = (v: unknown) => (v !== null && v !== undefined ? Number(v) : null);
  const pct = (a: number | null, b: number | null) =>
    a !== null && b ? (a - b) / Math.abs(b) : null;

  return NextResponse.json(
    rows.map((r) => {
      const revenue  = n(r.revenue_ytd);
      const ebitda   = n(r.ebitda_ytd);
      const revPrior = n(r.revenue_ytd_prior);
      const ebitPrior = n(r.ebitda_ytd_prior);
      return {
        companyId:          r.company_id,
        companyName:        r.company_name,
        revenue,
        ebitda,
        ebitdaMargin:       revenue && ebitda !== null ? ebitda / revenue : null,
        resultado:          n(r.resultado_ytd),
        revenueVsPriorPct:  pct(revenue, revPrior),
        ebitdaVsPriorPct:   pct(ebitda, ebitPrior),
      };
    })
  );
}
