import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getAllowedCompanyIds } from "@/lib/permissions";
import { BOARD_COMMENTARY_PROMPT_V1, CURRENT_PROMPT_VERSION } from "@/lib/ai/prompts";
import { buildFinancialContextPack } from "@/lib/ai/buildFinancialContextPack";
import { buildContextText } from "@/lib/ai/runFinancialAnalysis";

const MODEL = "claude-sonnet-4-6";

export type BoardCommentaryData = {
  id: string;
  comment: string;
  status: "draft" | "approved" | "rejected";
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  canApprove: boolean;
};

// ─── GET — load existing AI commentary for a period ───────────────────────────
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const canApprove = user.role === "admin" || user.role === "finance";

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");
  if (!period) return NextResponse.json({ error: "Missing period" }, { status: 400 });

  // Validate company scope
  const allowedIds = await getAllowedCompanyIds(user.id, user.role);
  const companyIdsParam = searchParams.get("companyIds");
  if (companyIdsParam && allowedIds !== null && !allowedIds.includes(companyIdsParam)) {
    return NextResponse.json(null);
  }

  try {
    const rows = await sql`
      SELECT fc.id, fc.comment, fc.status, fc.approved_at,
             au.email AS approved_by, fc.created_at
      FROM finanzas.financial_comments fc
      LEFT JOIN finanzas.app_users au ON au.id = fc.approved_by
      WHERE fc.period_month = date_trunc('month', ${period}::date)::date
        AND fc.source = 'ai'
        AND fc.company_id IS NULL
        AND fc.status != 'rejected'
      ORDER BY fc.created_at DESC
      LIMIT 1
    `;

    if (rows.length === 0) return NextResponse.json(null);

    const r = rows[0];
    return NextResponse.json({
      id:         String(r.id),
      comment:    String(r.comment),
      status:     r.status as "draft" | "approved",
      approvedAt: r.approved_at ? String(r.approved_at) : null,
      approvedBy: r.approved_by ? String(r.approved_by) : null,
      createdAt:  String(r.created_at),
      canApprove,
    } satisfies BoardCommentaryData);
  } catch {
    return NextResponse.json(null);
  }
}

// ─── POST — generate new AI board commentary draft ────────────────────────────
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "REPLACE_WITH_API_KEY") {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
  }

  let body: { period: string; companyIds?: string[] | null };
  try {
    body = (await request.json()) as { period: string; companyIds?: string[] | null };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { period, companyIds } = body;
  if (!period) return NextResponse.json({ error: "Missing period" }, { status: 400 });

  // Build context pack (reuses permission logic)
  const pack = await buildFinancialContextPack({
    userId: user.id,
    userRole: user.role,
    period,
    companyIds: companyIds ?? null,
  });

  const contextText = buildContextText(pack);

  // Single Claude call with board commentary prompt
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model:      MODEL,
    max_tokens: 1500,
    system:     BOARD_COMMENTARY_PROMPT_V1,
    messages:   [{ role: "user", content: contextText }],
  });

  const commentary = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
  if (!commentary) {
    return NextResponse.json({ error: "No se pudo generar el comentario" }, { status: 500 });
  }

  // Save to financial_comments with source='ai', status='draft', visibility='board'
  const periodStart = period.slice(0, 7) + "-01";
  const [row] = await sql`
    INSERT INTO finanzas.financial_comments
      (period_month, company_id, pnl_line_code, comment, visibility, created_by, source, status)
    VALUES
      (${periodStart}::date, NULL, NULL, ${commentary}, 'board', ${user.id}::uuid, 'ai', 'draft')
    RETURNING id, comment, status, created_at
  `;

  void logAudit({
    userId:     user.id,
    action:     "ai_board_commentary.generate",
    entityType: "financial_comments",
    entityId:   String(row.id),
    metadata:   { period, model: MODEL, promptVersion: CURRENT_PROMPT_VERSION },
  });

  return NextResponse.json({
    id:         String(row.id),
    comment:    String(row.comment),
    status:     "draft" as const,
    approvedAt: null,
    approvedBy: null,
    createdAt:  String(row.created_at),
    canApprove: true,
  } satisfies BoardCommentaryData, { status: 201 });
}
