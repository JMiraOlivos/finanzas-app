import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAllowedCompanyIds, assertCanExport } from "@/lib/permissions";
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

  // Validate per-company export permission before generating any file
  if (format === "excel" && companyIds !== null) {
    for (const cid of companyIds) {
      try {
        await assertCanExport(user.id, user.role, cid);
      } catch {
        return NextResponse.json({ error: "Forbidden: export not allowed for one or more selected companies" }, { status: 403 });
      }
    }
  }

  if (mode === "vs_ly" || mode === "vs_ly_budget") {
    const compData = companyIds === null
      ? await sql`SELECT * FROM finanzas.fn_pnl_ytd_comparison(${period}::date, NULL)`
      : await sql`SELECT * FROM finanzas.fn_pnl_ytd_comparison(${period}::date, ${companyIds}::uuid[])`;

    const payload = mode === "vs_ly"
      ? buildVsLyPayload(compData, period)
      : buildVsLyBudgetPayload(compData, period);

    if (format === "excel") {
      const buf = await buildEerrWorkbook({ title: payload.title, periodLabel: payload.periodLabel, columnGroups: payload.columnGroups, rows: payload.rows });
      const suffix = mode === "vs_ly" ? "vsLY" : "vsLY_Ppto";
      return new Response(buf.buffer as ArrayBuffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="EERR_${suffix}_${period}.xlsx"`,
        },
      });
    }
    return NextResponse.json(payload);
  }

  if (mode === "vs_budget") {
    const compData = companyIds === null
      ? await sql`SELECT * FROM finanzas.fn_pnl_ytd_comparison(${period}::date, NULL)`
      : await sql`SELECT * FROM finanzas.fn_pnl_ytd_comparison(${period}::date, ${companyIds}::uuid[])`;

    const payload = buildVsBudgetPayload(compData, period);

    if (format === "excel") {
      const buf = await buildEerrWorkbook({ title: payload.title, periodLabel: payload.periodLabel, columnGroups: payload.columnGroups, rows: payload.rows });
      return new Response(buf.buffer as ArrayBuffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="EERR_vsPpto_${period}.xlsx"`,
        },
      });
    }
    return NextResponse.json(payload);
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

function buildComparisonLineMap(
  data: Record<string, unknown>[],
): { companies: { id: string; name: string }[]; lineMap: Map<string, FinancialRow & { _actual: Map<string,number|null>; _ly: Map<string,number|null>; _budget: Map<string,number|null> }> } {
  const companyMap = new Map<string, string>();
  for (const row of data) {
    if (row.company_id && row.company_name) {
      companyMap.set(row.company_id as string, row.company_name as string);
    }
  }
  const companies = Array.from(companyMap.entries()).map(([id, name]) => ({ id, name }));

  type ExtRow = FinancialRow & { _actual: Map<string,number|null>; _ly: Map<string,number|null>; _budget: Map<string,number|null> };
  const lineMap = new Map<string, ExtRow>();

  for (const row of data) {
    const code = row.line_code as string;
    if (!lineMap.has(code)) {
      lineMap.set(code, {
        code,
        label:         row.line_label    as string,
        parentCode:    row.parent_code   as string | null,
        level:         Number(row.level),
        sortOrder:     Number(row.sort_order),
        lineType:      row.line_type     as FinancialRow["lineType"],
        isBold:        Boolean(row.is_bold),
        isHighlighted: Boolean(row.is_highlighted),
        values:        {},
        _actual:       new Map(),
        _ly:           new Map(),
        _budget:       new Map(),
      });
    }
    const line = lineMap.get(code)!;
    const cid  = row.company_id as string;
    line._actual.set(cid,  row.actual_ytd  !== null ? Number(row.actual_ytd)  : null);
    line._ly.set(cid,      row.ly_ytd      !== null ? Number(row.ly_ytd)      : null);
    line._budget.set(cid,  row.budget_ytd  !== null ? Number(row.budget_ytd)  : null);
  }

  return { companies, lineMap };
}

function buildVsLyPayload(
  data: Record<string, unknown>[],
  period: string,
): FinancialStatementPayload {
  const { companies, lineMap } = buildComparisonLineMap(data);

  const columnGroups: FinancialColumnGroup[] = companies.map((c) => ({
    id: c.id,
    label: c.name,
    columns: [
      { id: `${c.id}|actual`,   label: "Real YTD",   type: "currency"   as const },
      { id: `${c.id}|ly`,       label: "LY YTD",     type: "currency"   as const },
      { id: `${c.id}|var_amt`,  label: "Var $",      type: "currency"   as const },
      { id: `${c.id}|var_pct`,  label: "Var %",      type: "percentage" as const },
      { id: `${c.id}|rev_act`,  label: "% Ing. Act", type: "percentage" as const },
      { id: `${c.id}|rev_ly`,   label: "% Ing. LY",  type: "percentage" as const },
      { id: `${c.id}|var_pp`,   label: "Var pp",     type: "percentage" as const },
    ],
  }));

  const rows = Array.from(lineMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);

  // Per-company revenue for % calculations
  const revActual = new Map<string, number | null>();
  const revLy     = new Map<string, number | null>();
  for (const row of rows) {
    if (row.code === "INGRESOS") {
      for (const { id: cid } of companies) {
        revActual.set(cid, row._actual.get(cid) ?? null);
        revLy.set(cid,     row._ly.get(cid)     ?? null);
      }
    }
  }

  for (const row of rows) {
    for (const { id: cid } of companies) {
      const actual = row._actual.get(cid) ?? null;
      const ly     = row._ly.get(cid)     ?? null;
      const ra     = revActual.get(cid) ?? null;
      const rl     = revLy.get(cid)     ?? null;
      const varAmt = actual !== null && ly !== null ? actual - ly : null;
      const varPct = varAmt !== null && ly !== null && ly !== 0 ? varAmt / Math.abs(ly) : null;
      const revAct = actual !== null && ra && ra !== 0 ? actual / ra : null;
      const revLyPct = ly !== null && rl && rl !== 0 ? ly / rl : null;
      const varPp  = revAct !== null && revLyPct !== null ? revAct - revLyPct : null;
      row.values[`${cid}|actual`]  = actual;
      row.values[`${cid}|ly`]      = ly;
      row.values[`${cid}|var_amt`] = varAmt;
      row.values[`${cid}|var_pct`] = varPct;
      row.values[`${cid}|rev_act`] = revAct;
      row.values[`${cid}|rev_ly`]  = revLyPct;
      row.values[`${cid}|var_pp`]  = varPp;
    }
  }

  const TOTAL = "__TOTAL__";
  if (companies.length > 1) {
    let sumRA = 0, sumRL = 0;
    for (const row of rows) {
      if (row.code === "INGRESOS") {
        for (const { id: cid } of companies) {
          sumRA += row._actual.get(cid) ?? 0;
          sumRL += row._ly.get(cid)     ?? 0;
        }
      }
    }
    for (const row of rows) {
      let tA = 0, tL = 0;
      for (const { id: cid } of companies) {
        tA += row._actual.get(cid) ?? 0;
        tL += row._ly.get(cid)     ?? 0;
      }
      const tVar    = tA - tL;
      const tVarPct = tL !== 0 ? tVar / Math.abs(tL) : null;
      const tRA     = sumRA !== 0 ? tA / sumRA : null;
      const tRL     = sumRL !== 0 ? tL / sumRL : null;
      const tPp     = tRA !== null && tRL !== null ? tRA - tRL : null;
      row.values[`${TOTAL}|actual`]  = tA;
      row.values[`${TOTAL}|ly`]      = tL;
      row.values[`${TOTAL}|var_amt`] = tVar;
      row.values[`${TOTAL}|var_pct`] = tVarPct;
      row.values[`${TOTAL}|rev_act`] = tRA;
      row.values[`${TOTAL}|rev_ly`]  = tRL;
      row.values[`${TOTAL}|var_pp`]  = tPp;
    }
    columnGroups.push({ id: TOTAL, label: "Total", columns: [
      { id: `${TOTAL}|actual`,  label: "Real YTD",   type: "currency",   isAggregate: true },
      { id: `${TOTAL}|ly`,      label: "LY YTD",     type: "currency",   isAggregate: true },
      { id: `${TOTAL}|var_amt`, label: "Var $",      type: "currency",   isAggregate: true },
      { id: `${TOTAL}|var_pct`, label: "Var %",      type: "percentage", isAggregate: true },
      { id: `${TOTAL}|rev_act`, label: "% Ing. Act", type: "percentage", isAggregate: true },
      { id: `${TOTAL}|rev_ly`,  label: "% Ing. LY",  type: "percentage", isAggregate: true },
      { id: `${TOTAL}|var_pp`,  label: "Var pp",     type: "percentage", isAggregate: true },
    ]});
  }

  return {
    title: "Estado de Resultados",
    periodLabel: `vs Año Anterior YTD ${formatPeriodMonth(period)}`,
    columnGroups,
    rows,
  };
}

function buildVsLyBudgetPayload(
  data: Record<string, unknown>[],
  period: string,
): FinancialStatementPayload {
  const { companies, lineMap } = buildComparisonLineMap(data);

  const columnGroups: FinancialColumnGroup[] = companies.map((c) => ({
    id: c.id,
    label: c.name,
    columns: [
      { id: `${c.id}|actual`,       label: "Real YTD",    type: "currency"   as const },
      { id: `${c.id}|ly`,           label: "LY YTD",      type: "currency"   as const },
      { id: `${c.id}|budget`,       label: "Ppto. YTD",   type: "currency"   as const },
      { id: `${c.id}|var_ly_amt`,   label: "vs LY $",     type: "currency"   as const },
      { id: `${c.id}|var_ly_pct`,   label: "vs LY %",     type: "percentage" as const },
      { id: `${c.id}|var_bud_amt`,  label: "vs Ppto $",   type: "currency"   as const },
      { id: `${c.id}|var_bud_pct`,  label: "vs Ppto %",   type: "percentage" as const },
      { id: `${c.id}|attainment`,   label: "Cumpl. %",    type: "percentage" as const },
    ],
  }));

  const rows = Array.from(lineMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);

  for (const row of rows) {
    for (const { id: cid } of companies) {
      const actual  = row._actual.get(cid) ?? null;
      const ly      = row._ly.get(cid)     ?? null;
      const budget  = row._budget.get(cid) ?? null;
      const varLyAmt  = actual !== null && ly !== null ? actual - ly : null;
      const varLyPct  = varLyAmt !== null && ly !== null && ly !== 0 ? varLyAmt / Math.abs(ly) : null;
      const varBudAmt = actual !== null && budget !== null ? actual - budget : null;
      const varBudPct = varBudAmt !== null && budget !== null && budget !== 0 ? varBudAmt / Math.abs(budget) : null;
      const attain    = actual !== null && budget !== null && budget !== 0 ? actual / budget : null;
      row.values[`${cid}|actual`]      = actual;
      row.values[`${cid}|ly`]          = ly;
      row.values[`${cid}|budget`]      = budget;
      row.values[`${cid}|var_ly_amt`]  = varLyAmt;
      row.values[`${cid}|var_ly_pct`]  = varLyPct;
      row.values[`${cid}|var_bud_amt`] = varBudAmt;
      row.values[`${cid}|var_bud_pct`] = varBudPct;
      row.values[`${cid}|attainment`]  = attain;
    }
  }

  const TOTAL = "__TOTAL__";
  if (companies.length > 1) {
    for (const row of rows) {
      let tA = 0, tL = 0, tB = 0, hasBudget = false, hasLy = false;
      for (const { id: cid } of companies) {
        tA += row._actual.get(cid) ?? 0;
        const l = row._ly.get(cid);     if (l != null) { tL += l; hasLy = true; }
        const b = row._budget.get(cid); if (b != null) { tB += b; hasBudget = true; }
      }
      row.values[`${TOTAL}|actual`]      = tA;
      row.values[`${TOTAL}|ly`]          = hasLy     ? tL : null;
      row.values[`${TOTAL}|budget`]      = hasBudget ? tB : null;
      row.values[`${TOTAL}|var_ly_amt`]  = hasLy     ? tA - tL : null;
      row.values[`${TOTAL}|var_ly_pct`]  = hasLy     && tL !== 0 ? (tA - tL) / Math.abs(tL) : null;
      row.values[`${TOTAL}|var_bud_amt`] = hasBudget ? tA - tB : null;
      row.values[`${TOTAL}|var_bud_pct`] = hasBudget && tB !== 0 ? (tA - tB) / Math.abs(tB) : null;
      row.values[`${TOTAL}|attainment`]  = hasBudget && tB !== 0 ? tA / tB : null;
    }
    columnGroups.push({ id: TOTAL, label: "Total", columns: [
      { id: `${TOTAL}|actual`,      label: "Real YTD",  type: "currency",   isAggregate: true },
      { id: `${TOTAL}|ly`,          label: "LY YTD",    type: "currency",   isAggregate: true },
      { id: `${TOTAL}|budget`,      label: "Ppto. YTD", type: "currency",   isAggregate: true },
      { id: `${TOTAL}|var_ly_amt`,  label: "vs LY $",   type: "currency",   isAggregate: true },
      { id: `${TOTAL}|var_ly_pct`,  label: "vs LY %",   type: "percentage", isAggregate: true },
      { id: `${TOTAL}|var_bud_amt`, label: "vs Ppto $", type: "currency",   isAggregate: true },
      { id: `${TOTAL}|var_bud_pct`, label: "vs Ppto %", type: "percentage", isAggregate: true },
      { id: `${TOTAL}|attainment`,  label: "Cumpl. %",  type: "percentage", isAggregate: true },
    ]});
  }

  return {
    title: "Estado de Resultados",
    periodLabel: `vs LY + Ppto YTD ${formatPeriodMonth(period)}`,
    columnGroups,
    rows,
  };
}

function buildVsBudgetPayload(
  data: Record<string, unknown>[],
  period: string,
): FinancialStatementPayload {
  const { companies, lineMap } = buildComparisonLineMap(data);

  const columnGroups: FinancialColumnGroup[] = companies.map((c) => ({
    id: c.id,
    label: c.name,
    columns: [
      { id: `${c.id}|actual`,       label: "Real YTD",  type: "currency"   as const },
      { id: `${c.id}|budget`,       label: "Ppto. YTD", type: "currency"   as const },
      { id: `${c.id}|variance_pct`, label: "Var %",     type: "percentage" as const },
    ],
  }));

  const rows = Array.from(lineMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);

  for (const row of rows) {
    for (const { id: cid } of companies) {
      const actual = row._actual.get(cid) ?? null;
      const budget = row._budget.get(cid) ?? null;
      const varPct = actual != null && budget != null && budget !== 0
        ? (actual - budget) / Math.abs(budget) : null;
      row.values[`${cid}|actual`]       = actual;
      row.values[`${cid}|budget`]       = budget;
      row.values[`${cid}|variance_pct`] = varPct;
    }
  }

  const TOTAL = "__TOTAL__";
  if (companies.length > 1) {
    for (const row of rows) {
      let sumA = 0, sumB = 0, hasBudget = false;
      for (const { id: cid } of companies) {
        sumA += row._actual.get(cid) ?? 0;
        const b = row._budget.get(cid);
        if (b != null) { sumB += b; hasBudget = true; }
      }
      row.values[`${TOTAL}|actual`]  = sumA;
      row.values[`${TOTAL}|budget`]  = hasBudget ? sumB : null;
      row.values[`${TOTAL}|variance_pct`] =
        hasBudget && sumB !== 0 ? (sumA - sumB) / Math.abs(sumB) : null;
    }
    columnGroups.push({ id: TOTAL, label: "Total", columns: [
      { id: `${TOTAL}|actual`,       label: "Real YTD",  type: "currency",   isAggregate: true },
      { id: `${TOTAL}|budget`,       label: "Ppto. YTD", type: "currency",   isAggregate: true },
      { id: `${TOTAL}|variance_pct`, label: "Var %",     type: "percentage", isAggregate: true },
    ]});
  }

  return {
    title: "Estado de Resultados",
    periodLabel: `vs Presupuesto YTD ${formatPeriodMonth(period)}`,
    columnGroups,
    rows,
  };
}
