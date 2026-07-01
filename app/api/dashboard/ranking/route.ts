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

  // Current year YTD
  const currRows = allowedIds === null
    ? await sql`SELECT * FROM finanzas.fn_pnl_ytd(${period}::date, NULL)`
    : await sql`SELECT * FROM finanzas.fn_pnl_ytd(${period}::date, ${allowedIds}::uuid[])`;

  // Prior year same period
  const priorPeriod = `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
  const priorRows = allowedIds === null
    ? await sql`SELECT * FROM finanzas.fn_pnl_ytd(${priorPeriod}::date, NULL)`
    : await sql`SELECT * FROM finanzas.fn_pnl_ytd(${priorPeriod}::date, ${allowedIds}::uuid[])`;

  type PnlRow = { company_id: string; company_name: string; line_code: string; amount: string | null };

  function pivot(rows: PnlRow[]) {
    const map = new Map<string, { companyId: string; companyName: string; revenue: number | null; ebitda: number | null; resultado: number | null }>();
    for (const r of rows) {
      if (!map.has(r.company_id)) {
        map.set(r.company_id, { companyId: r.company_id, companyName: r.company_name, revenue: null, ebitda: null, resultado: null });
      }
      const entry = map.get(r.company_id)!;
      const v = r.amount !== null ? Number(r.amount) : null;
      if (r.line_code === "INGRESOS")        entry.revenue   = v;
      if (r.line_code === "EBITDA")          entry.ebitda    = v;
      if (r.line_code === "RESULTADO_FINAL") entry.resultado = v;
    }
    return map;
  }

  const curr  = pivot(currRows  as unknown as PnlRow[]);
  const prior = pivot(priorRows as unknown as PnlRow[]);

  const result = Array.from(curr.values()).map((c) => {
    const p            = prior.get(c.companyId);
    const ebitdaMargin = c.revenue && c.revenue !== 0 && c.ebitda != null ? c.ebitda / c.revenue : null;
    const revPrior     = p?.revenue ?? null;
    const revenueVsPriorPct = revPrior && revPrior !== 0 && c.revenue != null
      ? (c.revenue - revPrior) / Math.abs(revPrior)
      : null;
    const ebitPrior    = p?.ebitda ?? null;
    const ebitdaVsPriorPct = ebitPrior && ebitPrior !== 0 && c.ebitda != null
      ? (c.ebitda - ebitPrior) / Math.abs(ebitPrior)
      : null;
    return {
      companyId:          c.companyId,
      companyName:        c.companyName,
      revenue:            c.revenue,
      ebitda:             c.ebitda,
      ebitdaMargin,
      resultado:          c.resultado,
      revenueVsPriorPct,
      ebitdaVsPriorPct,
    };
  });

  result.sort((a, b) => (b.revenue ?? -Infinity) - (a.revenue ?? -Infinity));

  return NextResponse.json(result);
}
