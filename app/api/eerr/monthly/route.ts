import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAllowedCompanyIds } from "@/lib/permissions";
import { FinancialColumnGroup, FinancialRow } from "@/lib/eerr";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { searchParams } = new URL(request.url);

  const year    = searchParams.get("year");       // "2025"
  const rawIds  = searchParams.get("companyIds");

  if (!year || isNaN(Number(year))) {
    return NextResponse.json({ error: "Missing or invalid year" }, { status: 400 });
  }

  const allowedIds = await getAllowedCompanyIds(user.id, user.role);
  let companyIds: string[] | null = allowedIds;
  if (rawIds) {
    const requested = rawIds.split(",").map((s) => s.trim()).filter(Boolean);
    companyIds = allowedIds === null ? requested : requested.filter((id) => allowedIds.includes(id));
  }
  if (companyIds !== null && !companyIds.length) {
    return NextResponse.json({ columnGroups: [], rows: [] });
  }

  const data = companyIds === null
    ? await sql`SELECT * FROM finanzas.fn_pnl_monthly(${Number(year)}, NULL)`
    : await sql`SELECT * FROM finanzas.fn_pnl_monthly(${Number(year)}, ${companyIds}::uuid[])`;

  // Pivot: rows by (company, line) with months as nested values
  const monthsSet = new Set<string>();
  for (const r of data) monthsSet.add((r.period_month as string).slice(0, 7)); // "YYYY-MM"
  const months = Array.from(monthsSet).sort();

  const companyMap = new Map<string, string>();
  for (const r of data) {
    if (r.company_id) companyMap.set(r.company_id as string, r.company_name as string);
  }
  const companies = Array.from(companyMap.entries()).map(([id, name]) => ({ id, name }));

  const MONTH_LABELS: Record<string, string> = {
    "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
    "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
    "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
  };

  const columnGroups: FinancialColumnGroup[] = companies.map((c) => ({
    id: c.id,
    label: c.name,
    columns: months.map((m) => ({
      id: `${c.id}|${m}`,
      label: MONTH_LABELS[m.slice(5, 7)] ?? m,
      type: "currency" as const,
    })),
  }));

  const lineMap = new Map<string, FinancialRow>();
  for (const row of data) {
    const code = row.line_code as string;
    if (!lineMap.has(code)) {
      lineMap.set(code, {
        code,
        label:        row.line_label as string,
        parentCode:   row.parent_code as string | null,
        level:        Number(row.level),
        sortOrder:    Number(row.sort_order),
        lineType:     row.line_type as FinancialRow["lineType"],
        isBold:       Boolean(row.is_bold),
        isHighlighted: Boolean(row.is_highlighted),
        values: {},
      });
    }
    const line = lineMap.get(code)!;
    const cid = row.company_id as string;
    const m   = (row.period_month as string).slice(0, 7);
    line.values[`${cid}|${m}`] = row.amount !== null ? Number(row.amount) : null;
  }

  const rows = Array.from(lineMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  return NextResponse.json({
    title: `Estado de Resultados Mensual ${year}`,
    columnGroups,
    rows,
  });
}
