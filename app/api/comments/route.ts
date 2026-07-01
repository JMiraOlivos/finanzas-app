import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAllowedCompanyIds } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export type Comment = {
  id:           string;
  periodMonth:  string;
  companyId:    string | null;
  companyName:  string | null;
  pnlLineCode:  string | null;
  comment:      string;
  visibility:   "internal" | "board";
  createdBy:    string;
  createdAt:    string;
  updatedAt:    string;
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { searchParams } = new URL(request.url);
  const period      = searchParams.get("period");
  const companyId   = searchParams.get("companyId");
  const pnlLineCode = searchParams.get("pnlLineCode");

  if (!period) return NextResponse.json({ error: "Missing period" }, { status: 400 });

  const allowedIds   = await getAllowedCompanyIds(user.id, user.role);
  const canSeeBoard  = user.role === "admin" || user.role === "finance" || user.role === "director" || user.role === "partner";
  const visibilities = canSeeBoard ? ["internal", "board"] : ["board"];

  // Build company filter: intersection of requested + allowed
  let filterIds: string[] | null = allowedIds;
  if (companyId) {
    if (allowedIds === null) filterIds = [companyId];
    else if (allowedIds.includes(companyId)) filterIds = [companyId];
    else filterIds = [];
  }

  const rows = filterIds === null
    ? await sql`
        SELECT fc.id, fc.period_month, fc.company_id, c.name AS company_name,
               fc.pnl_line_code, fc.comment, fc.visibility,
               au.email AS created_by, fc.created_at, fc.updated_at
        FROM finanzas.financial_comments fc
        LEFT JOIN finanzas.companies c ON c.id = fc.company_id
        LEFT JOIN finanzas.app_users au ON au.id = fc.created_by
        WHERE fc.period_month = date_trunc('month', ${period}::date)::date
          AND (${pnlLineCode}::text IS NULL OR fc.pnl_line_code = ${pnlLineCode})
          AND fc.visibility = ANY(${visibilities}::text[])
        ORDER BY fc.created_at DESC`
    : await sql`
        SELECT fc.id, fc.period_month, fc.company_id, c.name AS company_name,
               fc.pnl_line_code, fc.comment, fc.visibility,
               au.email AS created_by, fc.created_at, fc.updated_at
        FROM finanzas.financial_comments fc
        LEFT JOIN finanzas.companies c ON c.id = fc.company_id
        LEFT JOIN finanzas.app_users au ON au.id = fc.created_by
        WHERE fc.period_month = date_trunc('month', ${period}::date)::date
          AND (fc.company_id IS NULL OR fc.company_id = ANY(${filterIds}::uuid[]))
          AND (${pnlLineCode}::text IS NULL OR fc.pnl_line_code = ${pnlLineCode})
          AND fc.visibility = ANY(${visibilities}::text[])
        ORDER BY fc.created_at DESC`;

  return NextResponse.json(rows.map((r) => ({
    id:          r.id,
    periodMonth: r.period_month,
    companyId:   r.company_id ?? null,
    companyName: r.company_name ?? null,
    pnlLineCode: r.pnl_line_code ?? null,
    comment:     r.comment,
    visibility:  r.visibility,
    createdBy:   r.created_by,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  } as Comment)));
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as {
    period_month: string;
    company_id?: string | null;
    pnl_line_code?: string | null;
    comment: string;
    visibility?: "internal" | "board";
  };

  const { period_month, company_id, pnl_line_code, comment, visibility = "internal" } = body;
  if (!period_month || !comment?.trim()) {
    return NextResponse.json({ error: "period_month and comment are required" }, { status: 400 });
  }

  // Validate company access
  if (company_id) {
    const allowedIds = await getAllowedCompanyIds(user.id, user.role);
    if (allowedIds !== null && !allowedIds.includes(company_id)) {
      return NextResponse.json({ error: "Forbidden: company not accessible" }, { status: 403 });
    }
  }

  const [row] = await sql`
    INSERT INTO finanzas.financial_comments
      (period_month, company_id, pnl_line_code, comment, visibility, created_by)
    VALUES
      (date_trunc('month', ${period_month}::date)::date,
       ${company_id ?? null}::uuid,
       ${pnl_line_code ?? null},
       ${comment.trim()},
       ${visibility},
       ${user.id}::uuid)
    RETURNING id`;

  await logAudit({
    userId: user.id,
    action: "comment.create",
    entityType: "financial_comments",
    entityId: row.id as string,
    metadata: { period_month, company_id, pnl_line_code, visibility },
  });

  return NextResponse.json({ id: row.id }, { status: 201 });
}
