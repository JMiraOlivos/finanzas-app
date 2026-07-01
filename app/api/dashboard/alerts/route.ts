import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAllowedCompanyIds } from "@/lib/permissions";

export type AlertItem = {
  severity: "red" | "yellow";
  message: string;
  detail?: string;
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");
  if (!period) return NextResponse.json({ error: "Missing period" }, { status: 400 });

  const allowedIds = await getAllowedCompanyIds(user.id, user.role);

  const alerts: AlertItem[] = [];

  // 1. Companies with no upload this period
  const noUploadRows = allowedIds === null
    ? await sql`
        SELECT c.name
        FROM finanzas.companies c
        WHERE c.is_active = TRUE
          AND NOT EXISTS (
            SELECT 1 FROM finanzas.uploaded_files uf
            WHERE uf.company_id = c.id
              AND uf.period_month = date_trunc('month', ${period}::date)
              AND uf.status = 'processed'
          )
        ORDER BY c.name`
    : await sql`
        SELECT c.name
        FROM finanzas.companies c
        WHERE c.is_active = TRUE
          AND c.id = ANY(${allowedIds}::uuid[])
          AND NOT EXISTS (
            SELECT 1 FROM finanzas.uploaded_files uf
            WHERE uf.company_id = c.id
              AND uf.period_month = date_trunc('month', ${period}::date)
              AND uf.status = 'processed'
          )
        ORDER BY c.name`;

  if (noUploadRows.length > 0) {
    const names = noUploadRows.map((r) => r.name as string);
    alerts.push({
      severity: "yellow",
      message: `${names.length} empresa${names.length > 1 ? "s" : ""} sin carga del período`,
      detail: names.slice(0, 5).join(", ") + (names.length > 5 ? ` y ${names.length - 5} más` : ""),
    });
  }

  // 2. Companies with negative EBITDA
  const pnlRows = allowedIds === null
    ? await sql`SELECT * FROM finanzas.fn_pnl_ytd(${period}::date, NULL)`
    : await sql`SELECT * FROM finanzas.fn_pnl_ytd(${period}::date, ${allowedIds}::uuid[])`;

  // Pivot by company to get EBITDA and revenue
  const byCompany = new Map<string, { name: string; ebitda: number | null; revenue: number | null; budget?: number | null }>();
  for (const r of pnlRows) {
    const cid = r.company_id as string;
    if (!byCompany.has(cid)) byCompany.set(cid, { name: r.company_name as string, ebitda: null, revenue: null });
    const entry = byCompany.get(cid)!;
    const v = r.amount !== null ? Number(r.amount) : null;
    if (r.line_code === "EBITDA")   entry.ebitda  = v;
    if (r.line_code === "INGRESOS") entry.revenue = v;
  }

  const negEbitda = Array.from(byCompany.values()).filter((c) => c.ebitda !== null && c.ebitda < 0);
  if (negEbitda.length > 0) {
    const names = negEbitda.map((c) => c.name);
    alerts.push({
      severity: "red",
      message: `EBITDA negativo en ${names.length} empresa${names.length > 1 ? "s" : ""}`,
      detail: names.slice(0, 5).join(", ") + (names.length > 5 ? ` y ${names.length - 5} más` : ""),
    });
  }

  // 3. Unmapped accounts with significant amount
  const unmappedRows = allowedIds === null
    ? await sql`
        SELECT COUNT(DISTINCT account_code)::int AS cnt,
               COALESCE(SUM(ABS(amount)), 0) AS total
        FROM finanzas.v_unmapped_pnl_accounts
        WHERE period_month = date_trunc('month', ${period}::date)`
    : await sql`
        SELECT COUNT(DISTINCT account_code)::int AS cnt,
               COALESCE(SUM(ABS(amount)), 0) AS total
        FROM finanzas.v_unmapped_pnl_accounts
        WHERE period_month = date_trunc('month', ${period}::date)
          AND company_id = ANY(${allowedIds}::uuid[])`;

  const unmapped = unmappedRows[0];
  const unmappedCnt = Number(unmapped?.cnt ?? 0);
  const unmappedTotal = Number(unmapped?.total ?? 0);
  if (unmappedCnt > 0) {
    const severity = unmappedTotal > 10000 ? "red" : "yellow";
    alerts.push({
      severity,
      message: `${unmappedCnt} cuenta${unmappedCnt > 1 ? "s" : ""} sin mapear`,
      detail: `Monto no clasificado: ${new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(unmappedTotal)}`,
    });
  }

  // 4. Budget miss > 10% (only if budget data exists)
  const budgetRows = await (allowedIds === null
    ? sql`
        SELECT c.name, SUM(bm.amount) AS budget_rev
        FROM finanzas.budget_monthly bm
        JOIN finanzas.budget_versions bv ON bm.version_id = bv.id
        JOIN finanzas.companies c ON c.id = bm.company_id
        JOIN finanzas.pnl_lines pl ON pl.id = bm.pnl_line_id
        WHERE bv.is_active = TRUE
          AND pl.code = 'INGRESOS'
          AND bm.period_month <= ${period}::date
          AND bm.period_month >= date_trunc('year', ${period}::date)
        GROUP BY c.id, c.name`
    : sql`
        SELECT c.name, SUM(bm.amount) AS budget_rev
        FROM finanzas.budget_monthly bm
        JOIN finanzas.budget_versions bv ON bm.version_id = bv.id
        JOIN finanzas.companies c ON c.id = bm.company_id
        JOIN finanzas.pnl_lines pl ON pl.id = bm.pnl_line_id
        WHERE bv.is_active = TRUE
          AND pl.code = 'INGRESOS'
          AND bm.company_id = ANY(${allowedIds}::uuid[])
          AND bm.period_month <= ${period}::date
          AND bm.period_month >= date_trunc('year', ${period}::date)
        GROUP BY c.id, c.name`);

  for (const br of budgetRows) {
    const cEntry = Array.from(byCompany.values()).find((c) => c.name === br.name);
    const actualRev  = cEntry?.revenue ?? null;
    const budgetRev  = Number(br.budget_rev);
    if (actualRev !== null && budgetRev !== 0) {
      const attain = actualRev / budgetRev;
      if (attain < 0.9) {
        alerts.push({
          severity: attain < 0.75 ? "red" : "yellow",
          message: `${br.name} bajo presupuesto de ingresos`,
          detail: `Cumplimiento: ${Math.round(attain * 100)}%`,
        });
      }
    }
  }

  // Sort: red first
  alerts.sort((a, b) => (a.severity === "red" ? -1 : 1) - (b.severity === "red" ? -1 : 1));

  return NextResponse.json(alerts);
}
