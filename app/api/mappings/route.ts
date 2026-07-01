import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin, getAllowedCompanyIds, assertCanViewCompany } from "@/lib/permissions";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// GET /api/mappings?companyId=&unmappedOnly=true
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { searchParams } = new URL(request.url);
  const companyId    = searchParams.get("companyId");
  const unmappedOnly = searchParams.get("unmappedOnly") === "true";

  // Validate company access before any query when a specific company is requested
  if (companyId) {
    try {
      await assertCanViewCompany(user.id, user.role, companyId);
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const allowedIds = await getAllowedCompanyIds(user.id, user.role);

  if (unmappedOnly) {
    const rows = companyId
      ? await sql`SELECT * FROM finanzas.v_unmapped_pnl_accounts WHERE company_id = ${companyId}::uuid ORDER BY total_amount DESC NULLS LAST`
      : allowedIds === null
        ? await sql`SELECT * FROM finanzas.v_unmapped_pnl_accounts ORDER BY company_name, total_amount DESC NULLS LAST`
        : await sql`SELECT * FROM finanzas.v_unmapped_pnl_accounts WHERE company_id = ANY(${allowedIds}::uuid[]) ORDER BY company_name, total_amount DESC NULLS LAST`;
    return NextResponse.json(rows);
  }

  // Full mapping list
  const rows = companyId
    ? await sql`
        SELECT apm.id, apm.company_id, c.name AS company_name,
               apm.account_code, apm.account_name, apm.pnl_line_id,
               pl.code AS pnl_line_code, pl.label AS pnl_line_label,
               apm.sign_multiplier, apm.is_active
        FROM finanzas.account_pnl_mappings apm
        JOIN finanzas.pnl_lines pl ON pl.id = apm.pnl_line_id
        LEFT JOIN finanzas.companies c ON c.id = apm.company_id
        WHERE (apm.company_id = ${companyId}::uuid OR apm.company_id IS NULL)
        ORDER BY apm.account_code`
    : allowedIds === null
      ? await sql`
          SELECT apm.id, apm.company_id, c.name AS company_name,
                 apm.account_code, apm.account_name, apm.pnl_line_id,
                 pl.code AS pnl_line_code, pl.label AS pnl_line_label,
                 apm.sign_multiplier, apm.is_active
          FROM finanzas.account_pnl_mappings apm
          JOIN finanzas.pnl_lines pl ON pl.id = apm.pnl_line_id
          LEFT JOIN finanzas.companies c ON c.id = apm.company_id
          ORDER BY apm.account_code`
      : await sql`
          SELECT apm.id, apm.company_id, c.name AS company_name,
                 apm.account_code, apm.account_name, apm.pnl_line_id,
                 pl.code AS pnl_line_code, pl.label AS pnl_line_label,
                 apm.sign_multiplier, apm.is_active
          FROM finanzas.account_pnl_mappings apm
          JOIN finanzas.pnl_lines pl ON pl.id = apm.pnl_line_id
          LEFT JOIN finanzas.companies c ON c.id = apm.company_id
          WHERE apm.company_id = ANY(${allowedIds}::uuid[]) OR apm.company_id IS NULL
          ORDER BY apm.account_code`;

  return NextResponse.json(rows);
}

// POST /api/mappings — create or update a mapping
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  if (!isAdmin(user.role) && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as {
    companyId?: string | null;
    accountCode: string;
    accountName?: string;
    pnlLineId: string;
    signMultiplier?: number;
  };

  if (!body.accountCode || !body.pnlLineId) {
    return NextResponse.json({ error: "accountCode and pnlLineId are required" }, { status: 400 });
  }

  const result = await sql`
    INSERT INTO finanzas.account_pnl_mappings
      (company_id, account_code, account_name, pnl_line_id, sign_multiplier, is_active)
    VALUES
      (${body.companyId ?? null}, ${body.accountCode}, ${body.accountName ?? null},
       ${body.pnlLineId}::uuid, ${body.signMultiplier ?? 1}, TRUE)
    ON CONFLICT (company_id, account_code)
    DO UPDATE SET
      pnl_line_id     = EXCLUDED.pnl_line_id,
      sign_multiplier = EXCLUDED.sign_multiplier,
      account_name    = EXCLUDED.account_name,
      is_active       = TRUE
    RETURNING id
  `;

  await logAudit({
    userId: user.id,
    action: "upsert_mapping",
    entityType: "account_pnl_mapping",
    entityId: result[0].id as string,
    metadata: {
      company_id: body.companyId ?? null,
      account_code: body.accountCode,
      pnl_line_id: body.pnlLineId,
    },
  });

  return NextResponse.json({ id: result[0].id }, { status: 201 });
}

// GET /api/mappings/pnl-lines — return all pnl_lines for the selector
export async function OPTIONS() {
  const lines = await sql`
    SELECT id, code, label, parent_code, level, sort_order, line_type
    FROM finanzas.pnl_lines
    WHERE show_in_report = TRUE
    ORDER BY sort_order
  `;
  return NextResponse.json(lines);
}
