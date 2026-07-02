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

  const items = await request.json() as BulkItem[];

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Body debe ser un array de mappings" }, { status: 400 });
  }

  let inserted = 0;
  for (const item of items) {
    if (!item.accountCode?.trim() || !item.pnlLineCode?.trim()) continue;

    // Deactivate existing active mapping for this (version, company, account)
    await sql`
      UPDATE finanzas.account_pnl_mappings_versioned
      SET is_active = false, updated_at = now(), updated_by = ${user.id}::uuid
      WHERE structure_version_id = ${id}::uuid
        AND account_code = ${item.accountCode}
        AND (company_id IS NOT DISTINCT FROM ${item.companyId ?? null}::uuid)
        AND is_active = true
    `;

    await sql`
      INSERT INTO finanzas.account_pnl_mappings_versioned
        (structure_version_id, company_id, account_code, account_name,
         pnl_line_code, sign_multiplier, created_by, updated_by)
      VALUES (
        ${id}::uuid,
        ${item.companyId ?? null}::uuid,
        ${item.accountCode},
        ${item.accountName ?? null},
        ${item.pnlLineCode},
        ${item.signMultiplier ?? 1},
        ${user.id}::uuid,
        ${user.id}::uuid
      )
    `;
    inserted++;
  }

  await logAudit({
    userId: user.id,
    action: "pnl_mapping.bulk_create",
    entityType: "account_pnl_mappings_versioned",
    metadata: { versionId: id, count: inserted },
  });

  return NextResponse.json({ ok: true, inserted });
}
