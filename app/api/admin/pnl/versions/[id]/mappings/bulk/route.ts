import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

type BulkItem = {
  companyId?: string | null;
  accountCode: string;
  accountName?: string | null;
  pnlLineCode: string;
  signMultiplier?: number;
};

export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const [version] = await sql`
    SELECT status FROM finanzas.pnl_structure_versions WHERE id = ${id}::uuid
  `;
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (version.status !== "draft") {
    return NextResponse.json({ error: `No se puede editar una versión con status '${version.status}'` }, { status: 409 });
  }

  const body = await request.json() as BulkItem[];
  if (!Array.isArray(body) || body.length === 0) {
    return NextResponse.json({ error: "Body debe ser un array de mappings" }, { status: 400 });
  }

  const items = body.filter((i) => i.accountCode?.trim() && i.pnlLineCode?.trim());
  if (items.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const accountCodes    = items.map((i) => i.accountCode);
  const companyIds      = items.map((i) => i.companyId ?? null);
  const accountNames    = items.map((i) => i.accountName ?? null);
  const pnlLineCodes    = items.map((i) => i.pnlLineCode);
  const signMultipliers = items.map((i) => i.signMultiplier ?? 1);

  await sql.begin(async (tx) => {
    // Single UPDATE to deactivate all affected mappings at once
    await tx`
      UPDATE finanzas.account_pnl_mappings_versioned m
      SET is_active = false, updated_at = now(), updated_by = ${user.id}::uuid
      FROM unnest(${accountCodes}::text[], ${companyIds}::uuid[]) AS v(account_code, company_id)
      WHERE m.structure_version_id = ${id}::uuid
        AND m.account_code = v.account_code
        AND (m.company_id IS NOT DISTINCT FROM v.company_id)
        AND m.is_active = true
    `;

    // Single INSERT for all new mappings
    await tx`
      INSERT INTO finanzas.account_pnl_mappings_versioned
        (structure_version_id, company_id, account_code, account_name,
         pnl_line_code, sign_multiplier, created_by, updated_by)
      SELECT
        ${id}::uuid,
        v.company_id,
        v.account_code,
        v.account_name,
        v.pnl_line_code,
        v.sign_multiplier,
        ${user.id}::uuid,
        ${user.id}::uuid
      FROM unnest(
        ${companyIds}::uuid[],
        ${accountCodes}::text[],
        ${accountNames}::text[],
        ${pnlLineCodes}::text[],
        ${signMultipliers}::int[]
      ) AS v(company_id, account_code, account_name, pnl_line_code, sign_multiplier)
    `;
  });

  await logAudit({
    userId: user.id,
    action: "pnl_mapping.bulk_create",
    entityType: "account_pnl_mappings_versioned",
    metadata: { versionId: id, count: items.length },
  });

  return NextResponse.json({ ok: true, inserted: items.length });
}
