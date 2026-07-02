import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { buildFinancialContextPack } from "@/lib/ai/buildFinancialContextPack";
import { runFinancialAnalysis } from "@/lib/ai/runFinancialAnalysis";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");
  if (!period) return NextResponse.json(null);

  const periodMonth = period.slice(0, 7) + "-01";

  const rows = await sql`
    SELECT final_output, created_at
    FROM finanzas.ai_analysis_runs
    WHERE period_month = ${periodMonth}::date
      AND analysis_type = 'period_summary'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!rows.length) return NextResponse.json(null);

  const output = rows[0].final_output as Record<string, unknown>;
  output.generatedAt = rows[0].created_at;
  return NextResponse.json(output);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };

  let body: {
    period?: string;
    companyIds?: string[] | null;
    metric?: string | null;
    comparisonMode?: "ly" | "budget" | "ly_budget" | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { period, companyIds, metric, comparisonMode } = body;
  if (!period) return NextResponse.json({ error: "Missing period" }, { status: 400 });

  // Build context pack (respects permissions internally)
  const contextPack = await buildFinancialContextPack({
    userId:         user.id,
    userRole:       user.role,
    period,
    companyIds:     companyIds ?? null,
    metric:         metric ?? null,
    comparisonMode: comparisonMode ?? null,
  });

  // Run two-pass analysis
  let result;
  try {
    result = await runFinancialAnalysis(contextPack);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error de IA desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Persist run — awaited so errors surface in Vercel logs
  const periodMonth = period.slice(0, 7) + "-01";
  const scopeJson   = JSON.stringify(contextPack.scope ?? {});
  const analystJson = JSON.stringify({ findings: result.findings, risks: result.risks, recommendedActions: result.recommendedActions });
  const finalJson   = JSON.stringify(result);
  const createdBy   = user.id ?? null;

  await sql`
    INSERT INTO finanzas.ai_analysis_runs
      (period_month, scope, analysis_type, prompt_version, model_name,
       analyst_output, cfo_output, final_output, created_by)
    VALUES (
      ${periodMonth}::date,
      ${scopeJson}::jsonb,
      'period_summary',
      ${result.promptVersion},
      ${result.modelName},
      ${analystJson}::jsonb,
      ${result.executiveSummary},
      ${finalJson}::jsonb,
      ${createdBy}
    )
  `.catch((err) => { console.error("[ai/period-summary] INSERT failed:", err); });

  // Audit log
  void logAudit({
    userId:     user.id,
    action:     "ai_period_summary",
    metadata:   { period, model: result.modelName, promptVersion: result.promptVersion },
  });

  return NextResponse.json(result);
}
