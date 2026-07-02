import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const [version] = await sql`
    SELECT id, name, status FROM finanzas.pnl_structure_versions WHERE id = ${id}::uuid
  `;
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await sql`
    SELECT
      cl.id,
      cl.change_type,
      cl.entity_type,
      cl.entity_code,
      cl.before_value,
      cl.after_value,
      cl.changed_at,
      u.email AS changed_by_email
    FROM finanzas.pnl_structure_change_log cl
    LEFT JOIN finanzas.app_users u ON u.id = cl.changed_by
    WHERE cl.structure_version_id = ${id}::uuid
    ORDER BY cl.changed_at DESC
    LIMIT 200
  `;

  return NextResponse.json({
    version: {
      id:     version.id,
      name:   version.name,
      status: version.status,
    },
    entries: rows.map((r) => ({
      id:             r.id,
      changeType:     r.change_type,
      entityType:     r.entity_type,
      entityCode:     r.entity_code ?? null,
      beforeValue:    r.before_value ?? null,
      afterValue:     r.after_value ?? null,
      changedAt:      r.changed_at,
      changedByEmail: r.changed_by_email ?? null,
    })),
  });
}
