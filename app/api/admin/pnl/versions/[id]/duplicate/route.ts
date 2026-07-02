import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: sourceId } = await params;
  const body = await request.json() as { name?: string; description?: string };

  const [source] = await sql`
    SELECT id, name FROM finanzas.pnl_structure_versions WHERE id = ${sourceId}::uuid
  `;
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newName = body.name?.trim() || `${source.name} (copia)`;

  // Single transaction: create new version + copy lines + copy mappings + copy formulas
  const [newVersion] = await sql`
    INSERT INTO finanzas.pnl_structure_versions
      (name, description, status, is_active, source_version_id, created_by)
    VALUES (
      ${newName},
      ${body.description ?? null},
      'draft',
      false,
      ${sourceId}::uuid,
      ${user.id}::uuid
    )
    RETURNING id, name, status, created_at
  `;

  const newId = newVersion.id as string;

  await sql`
    INSERT INTO finanzas.pnl_lines_versioned
      (structure_version_id, code, label, parent_code, level, sort_order,
       line_type, formula_key, show_in_report, is_bold, is_highlighted, is_active)
    SELECT
      ${newId}::uuid, code, label, parent_code, level, sort_order,
      line_type, formula_key, show_in_report, is_bold, is_highlighted, is_active
    FROM finanzas.pnl_lines_versioned
    WHERE structure_version_id = ${sourceId}::uuid
  `;

  await sql`
    INSERT INTO finanzas.account_pnl_mappings_versioned
      (structure_version_id, company_id, account_code, pnl_line_code, is_active)
    SELECT
      ${newId}::uuid, company_id, account_code, pnl_line_code, is_active
    FROM finanzas.account_pnl_mappings_versioned
    WHERE structure_version_id = ${sourceId}::uuid
  `;

  await sql`
    INSERT INTO finanzas.pnl_formula_components_versioned
      (structure_version_id, formula_key, component_line_code, operator, sort_order, is_active)
    SELECT
      ${newId}::uuid, formula_key, component_line_code, operator, sort_order, is_active
    FROM finanzas.pnl_formula_components_versioned
    WHERE structure_version_id = ${sourceId}::uuid
  `;

  await logAudit({
    userId: user.id,
    action: "pnl_version.duplicate",
    entityType: "pnl_structure_versions",
    entityId: newId,
    metadata: { sourceVersionId: sourceId, newName },
  });

  return NextResponse.json(newVersion, { status: 201 });
}
