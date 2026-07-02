import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

// Creates a new draft by copying an archived (or published) version's structure.
// Does NOT re-activate the source — the new draft must go through normal draft → publish flow.
export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores pueden restaurar versiones" }, { status: 403 });
  }

  const { id: sourceId } = await params;
  const body = await request.json() as { name?: string };

  const [source] = await sql`
    SELECT id, name, status FROM finanzas.pnl_structure_versions WHERE id = ${sourceId}::uuid
  `;
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (source.status === "draft") {
    return NextResponse.json(
      { error: "No tiene sentido restaurar un borrador — edítalo directamente" },
      { status: 409 }
    );
  }

  const newName = body.name?.trim() || `Restauración de: ${source.name as string}`;
  const newDesc = `Versión restaurada desde: ${source.name as string}`;

  const [newVersion] = await sql`
    INSERT INTO finanzas.pnl_structure_versions
      (name, description, status, is_active, source_version_id, created_by)
    VALUES (
      ${newName}, ${newDesc}, 'draft', false, ${sourceId}::uuid, ${user.id}::uuid
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
    SELECT ${newId}::uuid, company_id, account_code, pnl_line_code, is_active
    FROM finanzas.account_pnl_mappings_versioned
    WHERE structure_version_id = ${sourceId}::uuid
  `;

  await sql`
    INSERT INTO finanzas.pnl_formula_components_versioned
      (structure_version_id, formula_key, component_line_code, operator, sort_order)
    SELECT ${newId}::uuid, formula_key, component_line_code, operator, sort_order
    FROM finanzas.pnl_formula_components_versioned
    WHERE structure_version_id = ${sourceId}::uuid
  `;

  await sql`
    INSERT INTO finanzas.pnl_structure_change_log
      (structure_version_id, changed_by, change_type, entity_type, entity_code)
    VALUES (
      ${newId}::uuid, ${user.id}::uuid, 'rollback', 'pnl_structure_version', ${sourceId}
    )
  `;

  await logAudit({
    userId: user.id,
    action: "pnl_version.rollback",
    entityType: "pnl_structure_versions",
    entityId: newId,
    metadata: { sourceVersionId: sourceId, sourceName: source.name, newName },
  });

  return NextResponse.json({ id: newId, name: newName, status: "draft" }, { status: 201 });
}
