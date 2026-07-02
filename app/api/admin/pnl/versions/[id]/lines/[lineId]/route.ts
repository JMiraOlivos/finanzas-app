import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string; lineId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, lineId } = await params;

  const [version] = await sql`
    SELECT status FROM finanzas.pnl_structure_versions WHERE id = ${id}::uuid
  `;
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  if (version.status !== "draft") {
    return NextResponse.json(
      { error: `No se puede editar una versión con status '${version.status}'` },
      { status: 409 }
    );
  }

  const [line] = await sql`
    SELECT id FROM finanzas.pnl_lines_versioned
    WHERE id = ${lineId}::uuid AND structure_version_id = ${id}::uuid
  `;
  if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });

  const body = await request.json() as {
    label?: string;
    parentCode?: string | null;
    level?: number;
    lineType?: "detail" | "subtotal" | "calculated";
    formulaKey?: string | null;
    showInReport?: boolean;
    isBold?: boolean;
    isHighlighted?: boolean;
    isActive?: boolean;
  };

  const before = await sql`
    SELECT label, parent_code, level, line_type, formula_key,
           show_in_report, is_bold, is_highlighted, is_active
    FROM finanzas.pnl_lines_versioned WHERE id = ${lineId}::uuid
  `;

  await sql`
    UPDATE finanzas.pnl_lines_versioned
    SET
      label         = COALESCE(${body.label?.trim() ?? null}, label),
      parent_code   = CASE WHEN ${body.parentCode !== undefined} THEN ${body.parentCode ?? null} ELSE parent_code END,
      level         = COALESCE(${body.level ?? null}, level),
      line_type     = COALESCE(${body.lineType ?? null}, line_type),
      formula_key   = CASE WHEN ${body.formulaKey !== undefined} THEN ${body.formulaKey ?? null} ELSE formula_key END,
      show_in_report = COALESCE(${body.showInReport ?? null}, show_in_report),
      is_bold       = COALESCE(${body.isBold ?? null}, is_bold),
      is_highlighted = COALESCE(${body.isHighlighted ?? null}, is_highlighted),
      is_active     = COALESCE(${body.isActive ?? null}, is_active),
      updated_at    = now()
    WHERE id = ${lineId}::uuid
  `;

  await sql`
    UPDATE finanzas.pnl_structure_versions
    SET updated_at = now(), updated_by = ${user.id}::uuid
    WHERE id = ${id}::uuid
  `;

  await sql`
    INSERT INTO finanzas.pnl_structure_change_log
      (structure_version_id, changed_by, change_type, entity_type, entity_code,
       before_value, after_value)
    VALUES (
      ${id}::uuid, ${user.id}::uuid, 'update', 'pnl_line', ${lineId},
      ${JSON.stringify(before[0])}, ${JSON.stringify(body)}
    )
  `;

  await logAudit({
    userId: user.id,
    action: "pnl_line.update",
    entityType: "pnl_lines_versioned",
    entityId: lineId,
    metadata: { versionId: id, changes: body },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, lineId } = await params;

  const [version] = await sql`
    SELECT status FROM finanzas.pnl_structure_versions WHERE id = ${id}::uuid
  `;
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  if (version.status !== "draft") {
    return NextResponse.json(
      { error: `No se puede editar una versión con status '${version.status}'` },
      { status: 409 }
    );
  }

  // Soft delete
  await sql`
    UPDATE finanzas.pnl_lines_versioned
    SET is_active = false, updated_at = now()
    WHERE id = ${lineId}::uuid AND structure_version_id = ${id}::uuid
  `;

  await sql`
    UPDATE finanzas.pnl_structure_versions
    SET updated_at = now(), updated_by = ${user.id}::uuid
    WHERE id = ${id}::uuid
  `;

  await logAudit({
    userId: user.id,
    action: "pnl_line.delete",
    entityType: "pnl_lines_versioned",
    entityId: lineId,
    metadata: { versionId: id },
  });

  return NextResponse.json({ ok: true });
}
