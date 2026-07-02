import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

// Manually archive a draft version (discard without publishing).
// Published versions cannot be archived this way — publish a new version instead.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores pueden archivar versiones" }, { status: 403 });
  }

  const { id } = await params;

  const [version] = await sql`
    SELECT id, status FROM finanzas.pnl_structure_versions WHERE id = ${id}::uuid
  `;
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (version.status !== "draft") {
    return NextResponse.json(
      { error: "Solo se pueden archivar versiones en estado borrador. Para reemplazar la versión activa, publica una nueva." },
      { status: 409 }
    );
  }

  await sql`
    UPDATE finanzas.pnl_structure_versions
    SET
      status      = 'archived',
      is_active   = false,
      archived_by = ${user.id}::uuid,
      archived_at = now()
    WHERE id = ${id}::uuid
  `;

  await sql`
    INSERT INTO finanzas.pnl_structure_change_log
      (structure_version_id, changed_by, change_type, entity_type, entity_code)
    VALUES (
      ${id}::uuid, ${user.id}::uuid, 'archive', 'pnl_structure_version', ${id}
    )
  `;

  await logAudit({
    userId: user.id,
    action: "pnl_version.archive",
    entityType: "pnl_structure_versions",
    entityId: id,
  });

  return NextResponse.json({ ok: true });
}
