import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getAllowedCompanyIds } from "@/lib/permissions";
import { EXPLAIN_SYSTEM_PROMPT_V1, CURRENT_PROMPT_VERSION } from "@/lib/ai/prompts";
import { fmtNum, fmtPct } from "@/lib/ai/formatters";
import type { ExplanationResponse } from "@/lib/ai/types";

const MODEL = "claude-sonnet-4-6";

type TargetType = "kpi" | "bullet";

type Body = {
  period: string;
  companyIds?: string[] | null;
  targetType: TargetType;
  metricCode: string;
  companyId?: string | null;
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { period, targetType, metricCode, companyId } = body;
  if (!period || !targetType || !metricCode) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "REPLACE_WITH_API_KEY") {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
  }

  // Resolve permissions
  const allowedIds = await getAllowedCompanyIds(user.id, user.role);
  let effectiveIds: string[] | null = allowedIds;
  if (body.companyIds) {
    effectiveIds = allowedIds === null
      ? body.companyIds
      : body.companyIds.filter((id) => allowedIds.includes(id));
  }

  // Build targeted context
  const contextText = targetType === "bullet" && companyId
    ? await buildBulletContext(period, metricCode, companyId, effectiveIds)
    : await buildKpiContext(period, metricCode, effectiveIds);

  // Single Claude call
  const client = new Anthropic({ apiKey });
  let result: ExplanationResponse;
  try {
    const msg = await client.messages.create({
      model:     MODEL,
      max_tokens: 1200,
      system:    EXPLAIN_SYSTEM_PROMPT_V1,
      messages:  [{ role: "user", content: contextText }],
    });

    const text    = msg.content[0].type === "text" ? msg.content[0].text : "{}";
    const cleaned = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const parsed  = JSON.parse(cleaned) as Partial<ExplanationResponse>;

    result = {
      title:        parsed.title        ?? `Análisis de ${metricCode}`,
      explanation:  parsed.explanation  ?? "",
      keyNumbers:   Array.isArray(parsed.keyNumbers) ? parsed.keyNumbers : [],
      drivers:      Array.isArray(parsed.drivers)    ? parsed.drivers    : [],
      caveats:      Array.isArray(parsed.caveats)    ? parsed.caveats    : [],
      modelName:    MODEL,
      promptVersion: CURRENT_PROMPT_VERSION,
      generatedAt:  new Date().toISOString(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error de IA";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  void logAudit({
    userId:   user.id,
    action:   "ai_explain",
    metadata: { period, targetType, metricCode, companyId: companyId ?? null },
  });

  return NextResponse.json(result);
}

// ── Context builders ───────────────────────────────────────────────────────

async function buildKpiContext(
  period: string,
  metricCode: string,
  ids: string[] | null
): Promise<string> {
  const lines: string[] = [];

  const metricLabel = metricCode === "REVENUE_YTD" ? "Ingresos YTD" : metricCode === "EBITDA_YTD" ? "EBITDA YTD" : metricCode;
  const periodDate  = new Date(period + "T12:00:00Z");
  const periodLabel = periodDate.toLocaleDateString("es-CL", { month: "long", year: "numeric" });

  lines.push(`=== EXPLICACIÓN SOLICITADA: ${metricLabel} — ${periodLabel.toUpperCase()} ===`);

  // KPI aggregate
  try {
    const kpiRows = ids === null
      ? await sql`
          WITH latest AS (SELECT MAX(period_month) AS pm FROM finanzas.fct_dashboard_kpis
                          WHERE period_month <= date_trunc('month', ${period}::date)::date)
          SELECT SUM(revenue_ytd) AS rev, SUM(ebitda_ytd) AS ebitda,
                 SUM(revenue_ytd_prior) AS rev_ly, SUM(ebitda_ytd_prior) AS ebitda_ly,
                 SUM(revenue_ytd_budget) AS rev_bud, SUM(ebitda_ytd_budget) AS ebitda_bud
          FROM finanzas.fct_dashboard_kpis CROSS JOIN latest WHERE period_month = latest.pm
        `
      : await sql`
          WITH latest AS (SELECT MAX(period_month) AS pm FROM finanzas.fct_dashboard_kpis
                          WHERE period_month <= date_trunc('month', ${period}::date)::date
                            AND company_id = ANY(${ids}::uuid[]))
          SELECT SUM(revenue_ytd) AS rev, SUM(ebitda_ytd) AS ebitda,
                 SUM(revenue_ytd_prior) AS rev_ly, SUM(ebitda_ytd_prior) AS ebitda_ly,
                 SUM(revenue_ytd_budget) AS rev_bud, SUM(ebitda_ytd_budget) AS ebitda_bud
          FROM finanzas.fct_dashboard_kpis CROSS JOIN latest
          WHERE period_month = latest.pm AND company_id = ANY(${ids}::uuid[])
        `;

    const n = (v: unknown) => v !== null && v !== undefined ? Number(v) : null;
    const k = kpiRows[0];
    if (k) {
      const [actual, ly, bud] = metricCode === "REVENUE_YTD"
        ? [n(k.rev), n(k.rev_ly), n(k.rev_bud)]
        : [n(k.ebitda), n(k.ebitda_ly), n(k.ebitda_bud)];
      lines.push(`\nVALORES CONSOLIDADOS:`);
      lines.push(`  Real YTD:         ${fmtNum(actual)}`);
      lines.push(`  Presupuesto:      ${fmtNum(bud)}  (${bud && actual !== null ? fmtPct((actual - bud) / Math.abs(bud)) + " desviación" : "N/A"})`);
      lines.push(`  Año anterior:     ${fmtNum(ly)}   (${ly && actual !== null ? fmtPct((actual - ly) / Math.abs(ly)) + " variación" : "N/A"})`);
    }
  } catch { /* skip */ }

  // Bullet summary per company for this metric
  try {
    const bulletRows = ids === null
      ? await sql`
          WITH latest AS (SELECT MAX(period_month) AS pm FROM finanzas.fct_company_bullet_kpis
                          WHERE period_month <= date_trunc('month', ${period}::date)::date)
          SELECT company_name, actual_ytd, target_ytd, attainment_pct, status
          FROM finanzas.fct_company_bullet_kpis CROSS JOIN latest
          WHERE period_month = latest.pm AND metric_code = ${metricCode}
          ORDER BY attainment_pct ASC NULLS LAST
        `
      : await sql`
          WITH latest AS (SELECT MAX(period_month) AS pm FROM finanzas.fct_company_bullet_kpis
                          WHERE period_month <= date_trunc('month', ${period}::date)::date
                            AND company_id = ANY(${ids}::uuid[]))
          SELECT company_name, actual_ytd, target_ytd, attainment_pct, status
          FROM finanzas.fct_company_bullet_kpis CROSS JOIN latest
          WHERE period_month = latest.pm AND metric_code = ${metricCode}
            AND company_id = ANY(${ids}::uuid[])
          ORDER BY attainment_pct ASC NULLS LAST
        `;

    if (bulletRows.length > 0) {
      lines.push(`\nCUMPLIMIENTO POR EMPRESA (ordenado de menor a mayor):`);
      for (const b of bulletRows) {
        const n = (v: unknown) => v !== null ? Number(v) : null;
        lines.push(`  ${b.company_name}: ${fmtNum(n(b.actual_ytd))} / ppto ${fmtNum(n(b.target_ytd))} = ${fmtPct(n(b.attainment_pct))} [${b.status}]`);
      }
    }
  } catch { /* skip */ }

  // Top drivers for this period
  try {
    const driverRows = ids === null
      ? await sql`
          SELECT pnl_line_label, SUM(variance_vs_budget) AS var_bud, SUM(abs_impact_vs_budget) AS abs_imp
          FROM finanzas.fct_variance_drivers
          WHERE period_month = date_trunc('month', ${period}::date)::date
          GROUP BY pnl_line_code, pnl_line_label
          ORDER BY abs_imp DESC NULLS LAST LIMIT 8
        `
      : await sql`
          SELECT pnl_line_label, SUM(variance_vs_budget) AS var_bud, SUM(abs_impact_vs_budget) AS abs_imp
          FROM finanzas.fct_variance_drivers
          WHERE period_month = date_trunc('month', ${period}::date)::date
            AND company_id = ANY(${ids}::uuid[])
          GROUP BY pnl_line_code, pnl_line_label
          ORDER BY abs_imp DESC NULLS LAST LIMIT 8
        `;

    if (driverRows.length > 0) {
      lines.push(`\nPRINCIPALES DRIVERS VS PRESUPUESTO:`);
      for (const d of driverRows) {
        const v = Number(d.var_bud ?? 0);
        lines.push(`  ${d.pnl_line_label}: ${v >= 0 ? "+" : ""}${fmtNum(v)}`);
      }
    }
  } catch { /* skip */ }

  return lines.join("\n");
}

async function buildBulletContext(
  period: string,
  metricCode: string,
  companyId: string,
  ids: string[] | null
): Promise<string> {
  const lines: string[] = [];

  // Guard: company must be in effectiveIds
  if (ids !== null && !ids.includes(companyId)) {
    return "Sin acceso a los datos de esta empresa.";
  }

  const periodDate  = new Date(period + "T12:00:00Z");
  const periodLabel = periodDate.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  const metricLabel = metricCode === "REVENUE_YTD" ? "Ingresos YTD" : metricCode === "EBITDA_YTD" ? "EBITDA YTD" : metricCode;

  lines.push(`=== EXPLICACIÓN SOLICITADA: ${metricLabel} por empresa — ${periodLabel.toUpperCase()} ===`);

  // Company bullet
  try {
    const rows = await sql`
      WITH latest AS (SELECT MAX(period_month) AS pm FROM finanzas.fct_company_bullet_kpis
                      WHERE period_month <= date_trunc('month', ${period}::date)::date
                        AND company_id = ${companyId}::uuid)
      SELECT company_name, actual_ytd, target_ytd, ly_ytd,
             attainment_pct, variance_vs_target, variance_vs_target_pct, status
      FROM finanzas.fct_company_bullet_kpis CROSS JOIN latest
      WHERE period_month = latest.pm AND company_id = ${companyId}::uuid
        AND metric_code = ${metricCode}
    `;

    if (rows[0]) {
      const n = (v: unknown) => v !== null ? Number(v) : null;
      const r = rows[0];
      lines.push(`\nEMPRESA: ${r.company_name}`);
      lines.push(`  Real YTD:     ${fmtNum(n(r.actual_ytd))}`);
      lines.push(`  Presupuesto:  ${fmtNum(n(r.target_ytd))}`);
      lines.push(`  Año anterior: ${fmtNum(n(r.ly_ytd))}`);
      lines.push(`  Cumplimiento: ${fmtPct(n(r.attainment_pct))} [${r.status}]`);
      const vt = n(r.variance_vs_target);
      if (vt !== null) {
        lines.push(`  Desviación vs ppto: ${vt >= 0 ? "+" : ""}${fmtNum(vt)} (${fmtPct(n(r.variance_vs_target_pct))})`);
      }
    }
  } catch { /* skip */ }

  // Company-specific drivers
  try {
    const rows = await sql`
      SELECT pnl_line_label, actual_ytd, variance_vs_budget, variance_vs_budget_pct
      FROM finanzas.fct_variance_drivers
      WHERE period_month = date_trunc('month', ${period}::date)::date
        AND company_id = ${companyId}::uuid
      ORDER BY abs_impact_vs_budget DESC NULLS LAST
      LIMIT 10
    `;

    if (rows.length > 0) {
      lines.push(`\nPRINCIPALES DRIVERS DE ESTA EMPRESA VS PRESUPUESTO:`);
      for (const d of rows) {
        const v = Number(d.variance_vs_budget ?? 0);
        lines.push(`  ${d.pnl_line_label}: ${v >= 0 ? "+" : ""}${fmtNum(v)} (${fmtPct(Number(d.variance_vs_budget_pct ?? 0))})`);
      }
    }
  } catch { /* skip */ }

  // Company comments
  try {
    const monthStart = period.slice(0, 7) + "-01";
    const rows = await sql`
      SELECT body FROM finanzas.financial_comments
      WHERE company_id = ${companyId}::uuid AND period_month = ${monthStart}::date
      ORDER BY created_at DESC LIMIT 3
    `;
    if (rows.length > 0) {
      lines.push(`\nCOMENTARIOS REGISTRADOS:`);
      for (const c of rows) lines.push(`  - ${c.body}`);
    }
  } catch { /* skip */ }

  return lines.join("\n");
}
