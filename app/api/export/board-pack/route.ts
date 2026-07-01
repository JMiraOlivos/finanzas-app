import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAllowedCompanyIds } from "@/lib/permissions";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

// ─── E&V color palette ────────────────────────────────────────────────────────
const EV = {
  black:  "#303030",
  red:    "#E60000",
  gray3:  "#666666",
  gray6:  "#B3B3B3",
  gray7:  "#CCCCCC",
  beige2: "#F8F5F0",
  white:  "#FFFFFF",
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: { padding: 40, backgroundColor: EV.white, fontFamily: "Helvetica" },

  // Cover
  coverTitle: { fontSize: 28, color: EV.black, marginTop: 80, marginBottom: 8 },
  coverSub:   { fontSize: 11, color: EV.gray3,  letterSpacing: 2, textTransform: "uppercase" },
  coverPeriod:{ fontSize: 14, color: EV.black,  marginTop: 32 },
  coverDate:  { fontSize: 10, color: EV.gray3,  marginTop: 8 },
  redBar:     { height: 4, backgroundColor: EV.red, marginTop: 40, marginBottom: 40 },

  // Section header
  sectionTitle: { fontSize: 9, color: EV.gray3, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 },

  // KPI grid
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  kpiCard: { width: "47%", border: `1pt solid ${EV.gray7}`, padding: 12 },
  kpiLabel: { fontSize: 8, color: EV.gray3, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 },
  kpiValue: { fontSize: 20, color: EV.black },
  kpiNeg:   { fontSize: 20, color: EV.red },
  kpiBadge: { fontSize: 8, marginTop: 6 },
  kpiBadgePos: { color: "#527F1F" },
  kpiBadgeNeg: { color: EV.red },

  // Table
  tableHeader: { flexDirection: "row", backgroundColor: EV.beige2, borderBottom: `1pt solid ${EV.gray7}`, paddingVertical: 6, paddingHorizontal: 8 },
  tableRow:    { flexDirection: "row", borderBottom: `1pt solid ${EV.gray7}`, paddingVertical: 5, paddingHorizontal: 8 },
  tableRowAlt: { flexDirection: "row", borderBottom: `1pt solid ${EV.gray7}`, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: EV.beige2 },
  thText:      { fontSize: 7, color: EV.gray3, letterSpacing: 1, textTransform: "uppercase" },
  tdText:      { fontSize: 9, color: EV.black },
  tdBold:      { fontSize: 9, color: EV.black, fontFamily: "Helvetica-Bold" },
  tdRed:       { fontSize: 9, color: EV.red },
  tdGreen:     { fontSize: 9, color: "#527F1F" },

  // Divider
  divider: { height: 1, backgroundColor: EV.gray7, marginVertical: 20 },

  // Alert
  alertRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  alertDot: { width: 6, height: 6, borderRadius: 3 },
  alertText: { fontSize: 9, color: EV.black },
  alertDetail: { fontSize: 8, color: EV.gray3 },
});

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const fmtPct = (v: number | null) => v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
const fmtCur = (v: number | null) => v == null ? "—" : fmt.format(v);
const fmtPctAbs = (v: number | null) => v == null ? "—" : `${(v * 100).toFixed(1)}%`;

// ─── Types ────────────────────────────────────────────────────────────────────
type KpiMap = Record<string, number | null>;
type RankingRow = {
  companyName: string;
  revenue: number | null;
  ebitda: number | null;
  ebitdaMargin: number | null;
  revenueVsPriorPct: number | null;
};
type AlertItem = { severity: "red" | "yellow"; message: string; detail?: string };
type PnlRow = { line_code: string; line_label: string; line_type: string; is_bold: boolean; amount: number };

// ─── PDF Components ───────────────────────────────────────────────────────────
function KpiBlock({ label, value, format, vsPrior, vsBudget }: {
  label: string; value: number | null; format: string;
  vsPrior?: number | null; vsBudget?: number | null;
}) {
  const formatted = value == null ? "—"
    : format === "currency"   ? fmtCur(value)
    : format === "percentage" ? fmtPctAbs(value)
    : String(value);
  const negative = typeof value === "number" && value < 0;

  return React.createElement(View, { style: S.kpiCard },
    React.createElement(Text, { style: S.kpiLabel }, label),
    React.createElement(Text, { style: negative ? S.kpiNeg : S.kpiValue }, formatted),
    vsPrior != null && React.createElement(Text, {
      style: [S.kpiBadge, vsPrior >= 0 ? S.kpiBadgePos : S.kpiBadgeNeg]
    }, `${vsPrior >= 0 ? "▲" : "▼"} ${fmtPct(vsPrior)} vs año anterior`),
    vsBudget != null && React.createElement(Text, {
      style: [S.kpiBadge, vsBudget >= 0 ? S.kpiBadgePos : S.kpiBadgeNeg]
    }, `${vsBudget >= 0 ? "▲" : "▼"} ${fmtPct(vsBudget)} vs presupuesto`),
  );
}

function BoardPackPDF({ period, generatedAt, kpis, ranking, alerts, pnlLines }: {
  period: string;
  generatedAt: string;
  kpis: KpiMap;
  ranking: RankingRow[];
  alerts: AlertItem[];
  pnlLines: PnlRow[];
}) {
  return React.createElement(Document, {},

    // ── Cover ────────────────────────────────────────────────────────────────
    React.createElement(Page, { size: "A4", style: S.page },
      React.createElement(View, { style: S.redBar }),
      React.createElement(Text, { style: S.coverTitle }, "Board Pack Financiero"),
      React.createElement(Text, { style: S.coverSub }, "Engel & Völkers"),
      React.createElement(Text, { style: S.coverPeriod }, `Período: ${period}`),
      React.createElement(Text, { style: S.coverDate }, `Generado el ${generatedAt}`),
    ),

    // ── KPIs + Alerts ────────────────────────────────────────────────────────
    React.createElement(Page, { size: "A4", style: S.page },
      React.createElement(Text, { style: S.sectionTitle }, "KPIs Ejecutivos"),
      React.createElement(View, { style: S.kpiGrid },
        React.createElement(KpiBlock, { label: "Ingresos YTD", value: kpis["REVENUE_YTD"] ?? null, format: "currency", vsPrior: kpis["REVENUE_VS_PRIOR_PCT"] ?? null, vsBudget: kpis["REVENUE_VS_BUDGET_PCT"] ?? null }),
        React.createElement(KpiBlock, { label: "EBITDA YTD", value: kpis["EBITDA_YTD"] ?? null, format: "currency", vsPrior: kpis["EBITDA_VS_PRIOR_PCT"] ?? null, vsBudget: kpis["EBITDA_VS_BUDGET_PCT"] ?? null }),
        React.createElement(KpiBlock, { label: "Margen EBITDA", value: kpis["EBITDA_MARGIN"] ?? null, format: "percentage" }),
        React.createElement(KpiBlock, { label: "Resultado Final", value: kpis["RESULTADO_FINAL"] ?? null, format: "currency" }),
      ),

      React.createElement(View, { style: S.divider }),
      React.createElement(Text, { style: S.sectionTitle }, "Alertas"),
      ...alerts.map((a, i) =>
        React.createElement(View, { key: i, style: S.alertRow },
          React.createElement(View, { style: [S.alertDot, { backgroundColor: a.severity === "red" ? EV.red : "#EAB308" }] }),
          React.createElement(View, {},
            React.createElement(Text, { style: S.alertText }, a.message),
            a.detail && React.createElement(Text, { style: S.alertDetail }, a.detail),
          ),
        )
      ),
      alerts.length === 0 && React.createElement(Text, { style: S.alertDetail }, "Sin alertas para este período"),
    ),

    // ── Company Ranking ──────────────────────────────────────────────────────
    React.createElement(Page, { size: "A4", style: S.page },
      React.createElement(Text, { style: S.sectionTitle }, "Ranking Empresas"),
      React.createElement(View, { style: S.tableHeader },
        React.createElement(Text, { style: [S.thText, { flex: 3 }] }, "Empresa"),
        React.createElement(Text, { style: [S.thText, { flex: 2, textAlign: "right" }] }, "Ingresos YTD"),
        React.createElement(Text, { style: [S.thText, { flex: 2, textAlign: "right" }] }, "EBITDA YTD"),
        React.createElement(Text, { style: [S.thText, { flex: 1, textAlign: "right" }] }, "Margen"),
        React.createElement(Text, { style: [S.thText, { flex: 1, textAlign: "right" }] }, "vs Año Ant."),
      ),
      ...ranking.map((r, i) =>
        React.createElement(View, { key: i, style: i % 2 === 0 ? S.tableRow : S.tableRowAlt },
          React.createElement(Text, { style: [S.tdBold, { flex: 3 }] }, r.companyName),
          React.createElement(Text, { style: [S.tdText, { flex: 2, textAlign: "right" }] }, fmtCur(r.revenue)),
          React.createElement(Text, { style: [r.ebitda != null && r.ebitda < 0 ? S.tdRed : S.tdText, { flex: 2, textAlign: "right" }] }, fmtCur(r.ebitda)),
          React.createElement(Text, { style: [S.tdText, { flex: 1, textAlign: "right" }] }, fmtPctAbs(r.ebitdaMargin)),
          React.createElement(Text, { style: [r.revenueVsPriorPct != null && r.revenueVsPriorPct >= 0 ? S.tdGreen : S.tdRed, { flex: 1, textAlign: "right" }] }, fmtPct(r.revenueVsPriorPct)),
        )
      ),
    ),

    // ── Consolidated P&L ─────────────────────────────────────────────────────
    React.createElement(Page, { size: "A4", style: S.page },
      React.createElement(Text, { style: S.sectionTitle }, "Estado de Resultados Consolidado YTD"),
      React.createElement(View, { style: S.tableHeader },
        React.createElement(Text, { style: [S.thText, { flex: 4 }] }, "Línea"),
        React.createElement(Text, { style: [S.thText, { flex: 2, textAlign: "right" }] }, "Monto"),
      ),
      ...pnlLines.filter((l) => l.line_type !== "detail" || Math.abs(l.amount) > 0).map((r, i) =>
        React.createElement(View, { key: i, style: i % 2 === 0 ? S.tableRow : S.tableRowAlt },
          React.createElement(Text, { style: [r.is_bold ? S.tdBold : S.tdText, { flex: 4, paddingLeft: r.line_type === "detail" ? 12 : 0 }] }, r.line_label),
          React.createElement(Text, {
            style: [r.amount < 0 && r.line_type !== "detail" ? S.tdRed : (r.is_bold ? S.tdBold : S.tdText), { flex: 2, textAlign: "right" }]
          }, fmtCur(r.amount)),
        )
      ),
    ),
  );
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");
  if (!period) return NextResponse.json({ error: "Missing period" }, { status: 400 });

  const allowedIds = await getAllowedCompanyIds(user.id, user.role);

  // Fetch all data in parallel
  const [kpiRows, rankCurr, rankPrior, alertRows, pnlRows] = await Promise.all([
    allowedIds === null
      ? sql`SELECT * FROM finanzas.fn_dashboard_kpis(${period}::date, NULL)`
      : sql`SELECT * FROM finanzas.fn_dashboard_kpis(${period}::date, ${allowedIds}::uuid[])`,

    allowedIds === null
      ? sql`SELECT * FROM finanzas.fn_pnl_ytd(${period}::date, NULL)`
      : sql`SELECT * FROM finanzas.fn_pnl_ytd(${period}::date, ${allowedIds}::uuid[])`,

    allowedIds === null
      ? sql`SELECT * FROM finanzas.fn_pnl_ytd((${period}::date - INTERVAL '1 year')::date, NULL)`
      : sql`SELECT * FROM finanzas.fn_pnl_ytd((${period}::date - INTERVAL '1 year')::date, ${allowedIds}::uuid[])`,

    // Alerts: no upload this period
    allowedIds === null
      ? sql`
          SELECT c.name, NOT EXISTS (
            SELECT 1 FROM finanzas.uploaded_files uf
            WHERE uf.company_id = c.id
              AND uf.period_month = date_trunc('month', ${period}::date)
              AND uf.status = 'processed'
          ) AS no_upload
          FROM finanzas.companies c WHERE c.is_active = TRUE ORDER BY c.name`
      : sql`
          SELECT c.name, NOT EXISTS (
            SELECT 1 FROM finanzas.uploaded_files uf
            WHERE uf.company_id = c.id
              AND uf.period_month = date_trunc('month', ${period}::date)
              AND uf.status = 'processed'
          ) AS no_upload
          FROM finanzas.companies c
          WHERE c.is_active = TRUE AND c.id = ANY(${allowedIds}::uuid[])
          ORDER BY c.name`,

    allowedIds === null
      ? sql`SELECT line_code, line_label, line_type, is_bold, SUM(amount) AS amount FROM finanzas.fn_pnl_ytd(${period}::date, NULL) GROUP BY line_code, line_label, line_type, is_bold, sort_order ORDER BY sort_order`
      : sql`SELECT line_code, line_label, line_type, is_bold, SUM(amount) AS amount FROM finanzas.fn_pnl_ytd(${period}::date, ${allowedIds}::uuid[]) GROUP BY line_code, line_label, line_type, is_bold, sort_order ORDER BY sort_order`,
  ]);

  // Build KPI map
  const kpis: KpiMap = {};
  for (const r of kpiRows) {
    kpis[r.metric_code as string] = r.metric_value !== null ? Number(r.metric_value) : null;
  }

  // Build ranking by company
  type RowByCompany = Record<string, { name: string; revenue: number | null; ebitda: number | null; ebitdaMargin: number | null; revenueVsPrior: number | null }>;
  const curr:  Record<string, { name: string; revenue: number | null; ebitda: number | null }> = {};
  const prior: Record<string, { revenue: number | null }> = {};

  for (const r of rankCurr) {
    const cid = r.company_id as string;
    if (!curr[cid]) curr[cid] = { name: r.company_name as string, revenue: null, ebitda: null };
    if (r.line_code === "INGRESOS") curr[cid].revenue = Number(r.amount);
    if (r.line_code === "EBITDA")   curr[cid].ebitda  = Number(r.amount);
  }
  for (const r of rankPrior) {
    const cid = r.company_id as string;
    if (!prior[cid]) prior[cid] = { revenue: null };
    if (r.line_code === "INGRESOS") prior[cid].revenue = Number(r.amount);
  }

  const ranking: RankingRow[] = Object.entries(curr).map(([cid, c]) => {
    const p = prior[cid];
    const margin = c.revenue && c.revenue !== 0 && c.ebitda != null ? c.ebitda / c.revenue : null;
    const priorRev = p?.revenue ?? null;
    const vsPrior = priorRev && priorRev !== 0 && c.revenue != null ? (c.revenue - priorRev) / Math.abs(priorRev) : null;
    return { companyName: c.name, revenue: c.revenue, ebitda: c.ebitda, ebitdaMargin: margin, revenueVsPriorPct: vsPrior };
  }).sort((a, b) => (b.revenue ?? -Infinity) - (a.revenue ?? -Infinity));

  // Build alerts
  const alerts: AlertItem[] = [];
  const noUpload = alertRows.filter((r) => r.no_upload).map((r) => r.name as string);
  if (noUpload.length > 0) alerts.push({ severity: "yellow", message: `${noUpload.length} empresa(s) sin carga del período`, detail: noUpload.slice(0, 4).join(", ") });
  const negEbitda = ranking.filter((r) => r.ebitda !== null && r.ebitda < 0).map((r) => r.companyName);
  if (negEbitda.length > 0) alerts.push({ severity: "red", message: `EBITDA negativo: ${negEbitda.slice(0, 3).join(", ")}` });

  // Build consolidated P&L
  const pnlLines: PnlRow[] = pnlRows.map((r) => ({
    line_code:  r.line_code  as string,
    line_label: r.line_label as string,
    line_type:  r.line_type  as string,
    is_bold:    r.is_bold    as boolean,
    amount:     Number(r.amount),
  }));

  // Generate PDF
  const periodLabel = period.slice(0, 7);
  const generatedAt = new Date().toLocaleDateString("es-CL", { year: "numeric", month: "long", day: "numeric" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(
    React.createElement(BoardPackPDF, { period: periodLabel, generatedAt, kpis, ranking, alerts, pnlLines }) as any
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="board-pack-${periodLabel}.pdf"`,
    },
  });
}
