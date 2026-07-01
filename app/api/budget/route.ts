import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin, getAllowedCompanyIds } from "@/lib/permissions";
import { loadBudgetFile } from "@/lib/ingest/loadBudget";
import { sql } from "@/lib/db";
import { triggerDbtRun } from "@/lib/dbt";

export const runtime   = "nodejs";
export const maxDuration = 60;

// POST /api/budget — upload a budget CSV/Excel file
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  if (!isAdmin(user.role) && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden: only admin or finance can upload budgets" }, { status: 403 });
  }

  const formData = await request.formData();
  const file     = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await loadBudgetFile({
    buffer,
    filename:   file.name,
    uploadedBy: user.id,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  // Only trigger dbt when data is fully committed (no pending mappings)
  if (result.status === "committed") void triggerDbtRun();

  return NextResponse.json(result);
}

// GET /api/budget?period=YYYY-MM-DD — return active budget for a period (YTD)
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");
  if (!period) return NextResponse.json({ error: "Missing period" }, { status: 400 });

  const allowedIds = await getAllowedCompanyIds(user.id, user.role);

  const rows = allowedIds === null
    ? await sql`
        SELECT
          bv.company_id,
          c.name  AS company_name,
          pl.code AS pnl_line_code,
          pl.label AS pnl_line_label,
          bm.period_month,
          bm.amount
        FROM finanzas.budget_monthly bm
        JOIN finanzas.budget_versions bv ON bm.version_id = bv.id AND bv.is_active = TRUE
        JOIN finanzas.companies  c  ON c.id  = bm.company_id
        JOIN finanzas.pnl_lines  pl ON pl.id = bm.pnl_line_id
        WHERE bm.period_month >= date_trunc('year', ${period}::date)::date
          AND bm.period_month <= ${period}::date
        ORDER BY c.name, pl.sort_order, bm.period_month
      `
    : await sql`
        SELECT
          bv.company_id,
          c.name  AS company_name,
          pl.code AS pnl_line_code,
          pl.label AS pnl_line_label,
          bm.period_month,
          bm.amount
        FROM finanzas.budget_monthly bm
        JOIN finanzas.budget_versions bv ON bm.version_id = bv.id AND bv.is_active = TRUE
        JOIN finanzas.companies  c  ON c.id  = bm.company_id
        JOIN finanzas.pnl_lines  pl ON pl.id = bm.pnl_line_id
        WHERE bm.period_month >= date_trunc('year', ${period}::date)::date
          AND bm.period_month <= ${period}::date
          AND bm.company_id = ANY(${allowedIds}::uuid[])
        ORDER BY c.name, pl.sort_order, bm.period_month
      `;

  return NextResponse.json(rows);
}
