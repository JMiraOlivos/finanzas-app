import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAllowedCompanyIds } from "@/lib/permissions";
import { FinancialColumnGroup, FinancialRow, FinancialStatementPayload } from "@/lib/eerr";
import { buildEerrWorkbook } from "@/lib/export-excel";
import { formatPeriodMonth } from "@/lib/formatters";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { searchParams } = new URL(request.url);

  const period  = searchParams.get("period");  // "YYYY-MM-DD"
  const mode    = searchParams.get("mode") ?? "ytd";   // ytd | lmonth
  const format  = searchParams.get("format");           // excel
  const rawIds  = searchParams.get("companyIds");       // comma-separated UUIDs

  if (!period) {
    return NextResponse.json({ error: "Missing period parameter" }, { status: 400 });
  }

  const allowedIds = await getAllowedCompanyIds(user.id, user.role);

  // Intersect requested company IDs with allowed ones
  let companyIds: string[] | null = allowedIds;
  if (rawIds) {
    const requested = rawIds.split(",").map((s) => s.trim()).filter(Boolean);
    companyIds = allowedIds === null ? requested : requested.filter((id) => allowedIds.includes(id));
  }

  if (companyIds !== null && companyIds.length === 0) {
    const empty: FinancialStatementPayload = { title: "EERR", periodLabel: "", columnGroups: [], rows: [] };
    return NextResponse.json(empty);
  }

  const fnName = mode === "lmonth" ? "fn_pnl_lmonth_ytd" : "fn_pnl_ytd";

  const data = companyIds === null
    ? await sql`SELECT * FROM finanzas.${sql(fnName)}(${period}::date, NULL)`
    : await sql`SELECT * FROM finanzas.${sql(fnName)}(${period}::date, ${companyIds}::uuid[])`;

  const payload = buildPayload(data, mode, period);

  if (format === "excel") {
    const buf = await buildEerrWorkbook({
      title: payload.title,
      periodLabel: payload.periodLabel,
      columnGroups: payload.columnGroups,
      rows: payload.rows,
    });
    return new Response(buf.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="EERR_${period}.xlsx"`,
      },
    });
  }

  return NextResponse.json(payload);
}

function buildPayload(data: Record<string, unknown>[], mode: string, period: string): FinancialStatementPayload {
  const companyMap = new Map<string, string>();
  for (const row of data) {
    if (row.company_id && row.company_name) {
      companyMap.set(row.company_id as string, row.company_name as string);
    }
  }

  const companies = Array.from(companyMap.entries()).map(([id, name]) => ({ id, name }));

  const columnGroups: FinancialColumnGroup[] = companies.map((c) => {
    if (mode === "lmonth") {
      return {
        id: c.id,
        label: c.name,
        columns: [
          { id: `${c.id}|amount_lmonth`,      label: "Mes",      type: "currency" as const },
          { id: `${c.id}|amount_ytd`,         label: "YTD",      type: "currency" as const },
          { id: `${c.id}|revenue_pct_ytd`,    label: "% Ingr.",  type: "percentage" as const },
        ],
      };
    }
    return {
      id: c.id,
      label: c.name,
      columns: [
        { id: `${c.id}|amount`,              label: "M CLP",    type: "currency" as const },
        { id: `${c.id}|revenue_percentage`,  label: "% Ingr.",  type: "percentage" as const },
      ],
    };
  });

  const lineMap = new Map<string, FinancialRow>();
  for (const row of data) {
    const code = row.line_code as string;
    if (!lineMap.has(code)) {
      lineMap.set(code, {
        code,
        label:       row.line_label as string,
        parentCode:  row.parent_code as string | null,
        level:       Number(row.level),
        sortOrder:   Number(row.sort_order),
        lineType:    row.line_type as FinancialRow["lineType"],
        isBold:      Boolean(row.is_bold),
        isHighlighted: Boolean(row.is_highlighted),
        values:      {},
      });
    }

    const line = lineMap.get(code)!;
    const cid = row.company_id as string;

    if (mode === "lmonth") {
      line.values[`${cid}|amount_lmonth`]   = row.amount_lmonth    !== null ? Number(row.amount_lmonth)    : null;
      line.values[`${cid}|amount_ytd`]      = row.amount_ytd       !== null ? Number(row.amount_ytd)       : null;
      line.values[`${cid}|revenue_pct_ytd`] = row.revenue_pct_ytd  !== null ? Number(row.revenue_pct_ytd)  : null;
    } else {
      line.values[`${cid}|amount`]             = row.amount             !== null ? Number(row.amount)             : null;
      line.values[`${cid}|revenue_percentage`] = row.revenue_percentage !== null ? Number(row.revenue_percentage) : null;
    }
  }

  const rows = Array.from(lineMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);

  const TOTAL = "__TOTAL__";
  if (companies.length > 1) {
    if (mode === "lmonth") {
      for (const row of rows) {
        let sumL = 0, sumY = 0;
        for (const { id: cid } of companies) {
          sumL += row.values[`${cid}|amount_lmonth`] ?? 0;
          sumY += row.values[`${cid}|amount_ytd`]   ?? 0;
        }
        row.values[`${TOTAL}|amount_lmonth`] = sumL;
        row.values[`${TOTAL}|amount_ytd`]    = sumY;
      }
      const revYtd = rows.find((r) => r.code === "INGRESOS")?.values[`${TOTAL}|amount_ytd`] ?? null;
      for (const row of rows) {
        const ytd = row.values[`${TOTAL}|amount_ytd`];
        row.values[`${TOTAL}|revenue_pct_ytd`] =
          revYtd && revYtd !== 0 && ytd != null ? ytd / revYtd : null;
      }
      columnGroups.push({ id: TOTAL, label: "Total", columns: [
        { id: `${TOTAL}|amount_lmonth`,   label: "Mes",     type: "currency",   isAggregate: true },
        { id: `${TOTAL}|amount_ytd`,      label: "YTD",     type: "currency",   isAggregate: true },
        { id: `${TOTAL}|revenue_pct_ytd`, label: "% Ingr.", type: "percentage", isAggregate: true },
      ]});
    } else {
      for (const row of rows) {
        let sum = 0;
        for (const { id: cid } of companies) sum += row.values[`${cid}|amount`] ?? 0;
        row.values[`${TOTAL}|amount`] = sum;
      }
      const rev = rows.find((r) => r.code === "INGRESOS")?.values[`${TOTAL}|amount`] ?? null;
      for (const row of rows) {
        const amt = row.values[`${TOTAL}|amount`];
        row.values[`${TOTAL}|revenue_percentage`] =
          rev && rev !== 0 && amt != null ? amt / rev : null;
      }
      columnGroups.push({ id: TOTAL, label: "Total", columns: [
        { id: `${TOTAL}|amount`,             label: "M CLP",   type: "currency",   isAggregate: true },
        { id: `${TOTAL}|revenue_percentage`, label: "% Ingr.", type: "percentage", isAggregate: true },
      ]});
    }
  }

  const periodLabel = formatPeriodMonth(period);

  return {
    title: "Estado de Resultados",
    periodLabel: mode === "ytd" ? `YTD ${periodLabel}` : `${periodLabel} / YTD`,
    columnGroups,
    rows,
  };
}
