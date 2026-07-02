import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAllowedCompanyIds } from "@/lib/permissions";

export type DriverRow = {
  pnlLineCode:      string;
  pnlLineLabel:     string;
  varianceAmount:   number;
  variancePct:      number | null;
  actualYtd:        number;
  comparisonYtd:    number;
};

export type DriversPayload = {
  comparison:  "ly" | "budget";
  period:      string;
  positive:    DriverRow[];
  negative:    DriverRow[];
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { searchParams } = new URL(request.url);

  const period     = searchParams.get("period");
  const comparison = searchParams.get("comparison") ?? "budget";
  const rawIds     = searchParams.get("companyIds");
  const limit      = Math.min(Number(searchParams.get("limit") ?? "10"), 25);

  if (!period) return NextResponse.json({ error: "Missing period" }, { status: 400 });
  if (comparison !== "ly" && comparison !== "budget") {
    return NextResponse.json({ error: "comparison must be ly or budget" }, { status: 400 });
  }

  const allowedIds = await getAllowedCompanyIds(user.id, user.role);

  let companyIds: string[] | null = allowedIds;
  if (rawIds) {
    const requested = rawIds.split(",").map((s) => s.trim()).filter(Boolean);
    companyIds = allowedIds === null ? requested : requested.filter((id) => allowedIds.includes(id));
  }

  const varianceCol   = comparison === "ly" ? "variance_vs_ly"   : "variance_vs_budget";
  const absImpactCol  = comparison === "ly" ? "abs_impact_vs_ly" : "abs_impact_vs_budget";
  const comparisonCol = comparison === "ly" ? "ly_ytd"             : "budget_ytd";

  // Sum across companies, rank by absolute impact
  const rows = companyIds === null
    ? await sql`
        SELECT
          pnl_line_code,
          pnl_line_label,
          SUM(actual_ytd)            AS actual_ytd,
          SUM(${sql(comparisonCol)}) AS comparison_ytd,
          SUM(${sql(varianceCol)})   AS variance_amount,
          CASE
            WHEN SUM(${sql(comparisonCol)}) != 0
            THEN SUM(${sql(varianceCol)}) / ABS(SUM(${sql(comparisonCol)}))
            ELSE NULL
          END                        AS variance_pct,
          SUM(${sql(absImpactCol)})  AS abs_impact
        FROM finanzas.fct_variance_drivers
        WHERE period_month = date_trunc('month', ${period}::date)::date
        GROUP BY pnl_line_code, pnl_line_label
        ORDER BY abs_impact DESC NULLS LAST
      `
    : await sql`
        SELECT
          pnl_line_code,
          pnl_line_label,
          SUM(actual_ytd)            AS actual_ytd,
          SUM(${sql(comparisonCol)}) AS comparison_ytd,
          SUM(${sql(varianceCol)})   AS variance_amount,
          CASE
            WHEN SUM(${sql(comparisonCol)}) != 0
            THEN SUM(${sql(varianceCol)}) / ABS(SUM(${sql(comparisonCol)}))
            ELSE NULL
          END                        AS variance_pct,
          SUM(${sql(absImpactCol)})  AS abs_impact
        FROM finanzas.fct_variance_drivers
        WHERE period_month = date_trunc('month', ${period}::date)::date
          AND company_id = ANY(${companyIds}::uuid[])
        GROUP BY pnl_line_code, pnl_line_label
        ORDER BY abs_impact DESC NULLS LAST
      `;

  const n = (v: unknown) => (v !== null && v !== undefined ? Number(v) : null);

  const all: DriverRow[] = rows.map((r) => ({
    pnlLineCode:    r.pnl_line_code   as string,
    pnlLineLabel:   r.pnl_line_label  as string,
    varianceAmount: n(r.variance_amount) ?? 0,
    variancePct:    n(r.variance_pct),
    actualYtd:      n(r.actual_ytd) ?? 0,
    comparisonYtd:  n(r.comparison_ytd) ?? 0,
  }));

  const positive = all.filter((d) => d.varianceAmount > 0).slice(0, limit);
  const negative = all.filter((d) => d.varianceAmount < 0).slice(0, limit);

  const payload: DriversPayload = {
    comparison: comparison as "ly" | "budget",
    period,
    positive,
    negative,
  };

  return NextResponse.json(payload);
}
