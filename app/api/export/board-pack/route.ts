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

  // Board commentary
  commentaryPara: { fontSize: 10, color: EV.black, lineHeight: 1.6, marginBottom: 10 },
  commentaryNote: { fontSize: 8, color: EV.gray3, marginTop: 20, fontStyle: "italic" },

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
type DbDriverRow = { pnl_line_label: string; variance_amount: number; variance_pct: number | null };

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

function DriversSection({
  title, rows, positive,
}: { title: string; rows: DbDriverRow[]; positive: boolean }) {
  if (rows.length === 0) return null;
  return React.createElement(View, { style: { marginBottom: 16 } },
    React.createElement(Text, { style: [S.sectionTitle, { color: positive ? "#527F1F" : EV.red, marginBottom: 6 }] }, title),
    ...rows.slice(0, 5).map((r, i) =>
      React.createElement(View, { key: i, style: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 } },
        React.createElement(Text, { style: [S.tdText, { flex: 3 }] }, r.pnl_line_label),
        React.createElement(Text, { style: [positive ? S.tdGreen : S.tdRed, { flex: 1, textAlign: "right" }] },
          `${positive ? "+" : ""}${fmtCur(r.variance_amount)}${r.variance_pct != null ? ` (${fmtPct(r.variance_pct)})` : ""}`
        ),
      )
    ),
  );
}

function BoardPackPDF({ period, generatedAt, kpis, ranking, alerts, pnlLines, driversLy, driversBudget, commentary }: {
  period: string;
  generatedAt: string;
  kpis: KpiMap;
  ranking: RankingRow[];
  alerts: AlertItem[];
  pnlLines: PnlRow[];
  driversLy:     { positive: DbDriverRow[]; negative: DbDriverRow[] };
  driversBudget: { positive: DbDriverRow[]; negative: DbDriverRow[] };
  commentary: string | null;
}) {
  const commentaryParagraphs = commentary
    ? commentary.split(/\n\n+/).filter((p) => p.trim())
    : [];

  return React.createElement(Document, {},

    // ── Cover ────────────────────────────────────────────────────────────────
    React.createElement(Page, { size: "A4", style: S.page },
      React.createElement(View, { style: S.redBar }),
      React.createElement(Text, { style: S.coverTitle }, "Board Pack Financiero"),
      React.createElement(Text, { style: S.coverSub }, "Engel & Völkers"),
      React.createElement(Text, { style: S.coverPeriod }, `Período: ${period}`),
      React.createElement(Text, { style: S.coverDate }, `Generado el ${generatedAt}`),
    ),

    // ── Board Commentary ─────────────────────────────────────────────────────
    React.createElement(Page, { size: "A4", style: S.page },
      React.createElement(Text, { style: S.sectionTitle }, "Comentario Ejecutivo del CFO"),
      React.createElement(View, { style: S.divider }),
      ...(commentaryParagraphs.length > 0
        ? commentaryParagraphs.map((p, i) =>
            React.createElement(Text, { key: i, style: S.commentaryPara }, p.trim())
          )
        : [React.createElement(Text, { style: S.alertDetail },
            "Comentario ejecutivo pendiente de aprobación.")]),
      React.createElement(Text, { style: S.commentaryNote },
        "Comentario generado por IA y aprobado por el equipo financiero."
      ),
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

    // ── Variance Drivers ─────────────────────────────────────────────────────
    React.createElement(Page, { size: "A4", style: S.page },
      React.createElement(Text, { style: S.sectionTitle }, "Drivers de Variación YTD"),
      React.createElement(View, { style: S.divider }),

      React.createElement(Text, { style: [S.sectionTitle, { marginTop: 8 }] }, "vs Año Anterior"),
      React.createElement(DriversSection, { title: "Drivers positivos", rows: driversLy.positive, positive: true }),
      React.createElement(DriversSection, { title: "Drivers negativos", rows: driversLy.negative, positive: false }),

      React.createElement(View, { style: S.divider }),
      React.createElement(Text, { style: S.sectionTitle }, "vs Presupuesto"),
      React.createElement(DriversSection, { title: "Drivers positivos", rows: driversBudget.positive, positive: true }),
      React.createElement(DriversSection, { title: "Drivers negativos", rows: driversBudget.negative, positive: false }),
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

  // For published periods: use the P&L structure version that was active at close time
  // so historical board packs remain reproducible after structure changes.
  const [periodCloseRow] = await sql`
    SELECT pnl_structure_version_id
    FROM finanzas.financial_period_closes
    WHERE period_month = date_trunc('month', ${period}::date)::date
      AND status = 'published'
      AND pnl_structure_version_id IS NOT NULL
  `;
  const pinnedVersionId = (periodCloseRow?.pnl_structure_version_id as string) ?? null;

  const n = (v: unknown) => (v !== null && v !== undefined ? Number(v) : null);
  const pct = (a: number | null, b: number | null) =>
    a !== null && b ? (a - b) / Math.abs(b) : null;

  // Fetch all data in parallel
  const [kpiAndRankRows, alertRows, pnlRows, driversLyRows, driversBudgetRows] = await Promise.all([
    // KPIs + ranking from fct_dashboard_kpis (replaces fn_dashboard_kpis + fn_pnl_ytd x2)
    allowedIds === null
      ? sql`
          WITH latest AS (
            SELECT MAX(period_month) AS pm
            FROM finanzas.fct_dashboard_kpis
            WHERE period_month <= date_trunc('month', ${period}::date)::date
          )
          SELECT company_id, company_name,
                 revenue_ytd, ebitda_ytd, resultado_ytd, rrhh_ytd, mkt_ytd,
                 revenue_ytd_prior, ebitda_ytd_prior,
                 revenue_ytd_budget, ebitda_ytd_budget
          FROM finanzas.fct_dashboard_kpis
          CROSS JOIN latest
          WHERE period_month = latest.pm
          ORDER BY revenue_ytd DESC NULLS LAST
        `
      : sql`
          WITH latest AS (
            SELECT MAX(period_month) AS pm
            FROM finanzas.fct_dashboard_kpis
            WHERE period_month <= date_trunc('month', ${period}::date)::date
              AND company_id = ANY(${allowedIds}::uuid[])
          )
          SELECT company_id, company_name,
                 revenue_ytd, ebitda_ytd, resultado_ytd, rrhh_ytd, mkt_ytd,
                 revenue_ytd_prior, ebitda_ytd_prior,
                 revenue_ytd_budget, ebitda_ytd_budget
          FROM finanzas.fct_dashboard_kpis
          CROSS JOIN latest
          WHERE period_month = latest.pm
            AND company_id = ANY(${allowedIds}::uuid[])
          ORDER BY revenue_ytd DESC NULLS LAST
        `,

    // Alerts: no upload this period (unchanged)
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

    // P&L table: use pinned structure version for published periods (reproducibility),
    // otherwise fall back to fn_pnl_ytd which reads the dbt mart.
    pinnedVersionId
      ? allowedIds === null
          ? sql`
              SELECT pnl_line_code AS line_code, pnl_line_label AS line_label,
                     line_type, is_bold, COALESCE(amount_ytd, 0) AS amount
              FROM finanzas.fn_pnl_ytd_for_structure_version(
                ${period}::date, ${pinnedVersionId}::uuid
              )
              ORDER BY sort_order`
          : sql`
              SELECT pnl_line_code AS line_code, pnl_line_label AS line_label,
                     line_type, is_bold, COALESCE(amount_ytd, 0) AS amount
              FROM finanzas.fn_pnl_ytd_for_structure_version(
                ${period}::date, ${pinnedVersionId}::uuid, ${allowedIds}::uuid[]
              )
              ORDER BY sort_order`
      : allowedIds === null
          ? sql`SELECT line_code, line_label, line_type, is_bold, SUM(amount) AS amount FROM finanzas.fn_pnl_ytd(${period}::date, NULL) GROUP BY line_code, line_label, line_type, is_bold, sort_order ORDER BY sort_order`
          : sql`SELECT line_code, line_label, line_type, is_bold, SUM(amount) AS amount FROM finanzas.fn_pnl_ytd(${period}::date, ${allowedIds}::uuid[]) GROUP BY line_code, line_label, line_type, is_bold, sort_order ORDER BY sort_order`,

    // Drivers vs LY
    allowedIds === null
      ? sql`SELECT pnl_line_label, SUM(variance_vs_ly) AS variance_amount, CASE WHEN SUM(ly_ytd)!=0 THEN SUM(variance_vs_ly)/ABS(SUM(ly_ytd)) ELSE NULL END AS variance_pct FROM finanzas.fct_variance_drivers WHERE period_month = date_trunc('month', ${period}::date)::date GROUP BY pnl_line_code, pnl_line_label ORDER BY ABS(SUM(variance_vs_ly)) DESC NULLS LAST LIMIT 10`
      : sql`SELECT pnl_line_label, SUM(variance_vs_ly) AS variance_amount, CASE WHEN SUM(ly_ytd)!=0 THEN SUM(variance_vs_ly)/ABS(SUM(ly_ytd)) ELSE NULL END AS variance_pct FROM finanzas.fct_variance_drivers WHERE period_month = date_trunc('month', ${period}::date)::date AND company_id = ANY(${allowedIds}::uuid[]) GROUP BY pnl_line_code, pnl_line_label ORDER BY ABS(SUM(variance_vs_ly)) DESC NULLS LAST LIMIT 10`,

    // Drivers vs Budget
    allowedIds === null
      ? sql`SELECT pnl_line_label, SUM(variance_vs_budget) AS variance_amount, CASE WHEN SUM(budget_ytd)!=0 THEN SUM(variance_vs_budget)/ABS(SUM(budget_ytd)) ELSE NULL END AS variance_pct FROM finanzas.fct_variance_drivers WHERE period_month = date_trunc('month', ${period}::date)::date GROUP BY pnl_line_code, pnl_line_label ORDER BY ABS(SUM(variance_vs_budget)) DESC NULLS LAST LIMIT 10`
      : sql`SELECT pnl_line_label, SUM(variance_vs_budget) AS variance_amount, CASE WHEN SUM(budget_ytd)!=0 THEN SUM(variance_vs_budget)/ABS(SUM(budget_ytd)) ELSE NULL END AS variance_pct FROM finanzas.fct_variance_drivers WHERE period_month = date_trunc('month', ${period}::date)::date AND company_id = ANY(${allowedIds}::uuid[]) GROUP BY pnl_line_code, pnl_line_label ORDER BY ABS(SUM(variance_vs_budget)) DESC NULLS LAST LIMIT 10`,
  ]);

  // Build consolidated KPIs by summing across all companies
  let revSum = 0, ebitdaSum = 0, resSum = 0, rrhhSum = 0, mktSum = 0;
  let revPriorSum = 0, ebitPriorSum = 0, revBudSum = 0, ebitBudSum = 0;
  for (const r of kpiAndRankRows) {
    revSum       += n(r.revenue_ytd)        ?? 0;
    ebitdaSum    += n(r.ebitda_ytd)         ?? 0;
    resSum       += n(r.resultado_ytd)      ?? 0;
    rrhhSum      += n(r.rrhh_ytd)           ?? 0;
    mktSum       += n(r.mkt_ytd)            ?? 0;
    revPriorSum  += n(r.revenue_ytd_prior)  ?? 0;
    ebitPriorSum += n(r.ebitda_ytd_prior)   ?? 0;
    revBudSum    += n(r.revenue_ytd_budget) ?? 0;
    ebitBudSum   += n(r.ebitda_ytd_budget)  ?? 0;
  }

  const kpis: KpiMap = {
    REVENUE_YTD:           revSum,
    EBITDA_YTD:            ebitdaSum,
    EBITDA_MARGIN:         revSum !== 0 ? ebitdaSum / revSum : null,
    RESULTADO_FINAL:       resSum,
    RRHH_RATIO:            revSum !== 0 ? rrhhSum / revSum : null,
    MKT_RATIO:             revSum !== 0 ? mktSum / revSum : null,
    REVENUE_VS_PRIOR_PCT:  pct(revSum, revPriorSum),
    EBITDA_VS_PRIOR_PCT:   pct(ebitdaSum, ebitPriorSum),
    REVENUE_VS_BUDGET_PCT: pct(revSum, revBudSum),
    EBITDA_VS_BUDGET_PCT:  pct(ebitdaSum, ebitBudSum),
    EBITDA_BUDGET_ATTAIN:  ebitBudSum !== 0 ? ebitdaSum / ebitBudSum : null,
  };

  // Build per-company ranking
  const ranking: RankingRow[] = kpiAndRankRows.map((r) => {
    const revenue  = n(r.revenue_ytd);
    const ebitda   = n(r.ebitda_ytd);
    const revPrior = n(r.revenue_ytd_prior);
    return {
      companyName:        r.company_name as string,
      revenue,
      ebitda,
      ebitdaMargin:       revenue && revenue !== 0 && ebitda !== null ? ebitda / revenue : null,
      revenueVsPriorPct:  pct(revenue, revPrior),
    };
  });

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

  // Build drivers data
  const toDriverRow = (r: Record<string, unknown>): DbDriverRow => ({
    pnl_line_label: r.pnl_line_label as string,
    variance_amount: Number(r.variance_amount),
    variance_pct: r.variance_pct !== null && r.variance_pct !== undefined ? Number(r.variance_pct) : null,
  });
  const driversLy = {
    positive: driversLyRows.filter((r) => Number(r.variance_amount) > 0).map(toDriverRow),
    negative: driversLyRows.filter((r) => Number(r.variance_amount) < 0).map(toDriverRow),
  };
  const driversBudget = {
    positive: driversBudgetRows.filter((r) => Number(r.variance_amount) > 0).map(toDriverRow),
    negative: driversBudgetRows.filter((r) => Number(r.variance_amount) < 0).map(toDriverRow),
  };

  // Fetch approved AI commentary (safely — migration 021 may not be applied yet)
  let commentary: string | null = null;
  try {
    const [commentRow] = await sql`
      SELECT comment
      FROM finanzas.financial_comments
      WHERE period_month = date_trunc('month', ${period}::date)::date
        AND source = 'ai'
        AND status = 'approved'
        AND company_id IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    commentary = commentRow ? String(commentRow.comment) : null;
  } catch { /* source/status columns not yet available */ }

  // Generate PDF
  const periodLabel = period.slice(0, 7);
  const generatedAt = new Date().toLocaleDateString("es-CL", { year: "numeric", month: "long", day: "numeric" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(
    React.createElement(BoardPackPDF, { period: periodLabel, generatedAt, kpis, ranking, alerts, pnlLines, driversLy, driversBudget, commentary }) as any
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="board-pack-${periodLabel}.pdf"`,
    },
  });
}
