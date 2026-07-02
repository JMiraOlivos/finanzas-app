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

  const { id } = await params;

  const [version] = await sql`
    SELECT status FROM finanzas.pnl_structure_versions WHERE id = ${id}::uuid
  `;
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (version.status !== "draft") {
    return NextResponse.json(
      { error: `No se puede editar una versión con status '${version.status}'` },
      { status: 409 }
    );
  }

  // Expects: [{ id: string, sortOrder: number }, ...]
  const body = await request.json() as { id: string; sortOrder: number }[];

  if (!Array.isArray(body) || body.length === 0) {
    return NextResponse.json({ error: "Body debe ser un array de { id, sortOrder }" }, { status: 400 });
  }

  // Bulk update via unnest
  const ids = body.map((r) => r.id);
  const orders = body.map((r) => r.sortOrder);

  await sql`
    UPDATE finanzas.pnl_lines_versioned AS l
    SET sort_order = v.sort_order::integer,
        updated_at = now()
    FROM (
      SELECT unnest(${ids}::uuid[]) AS id,
             unnest(${orders}::integer[]) AS sort_order
    ) AS v
    WHERE l.id = v.id
      AND l.structure_version_id = ${id}::uuid
  `;

  await sql`
    UPDATE finanzas.pnl_structure_versions
    SET updated_at = now(), updated_by = ${user.id}::uuid
    WHERE id = ${id}::uuid
  `;

  await logAudit({
    userId: user.id,
    action: "pnl_lines.reorder",
    entityType: "pnl_structure_versions",
    entityId: id,
    metadata: { count: body.length },
  });

  return NextResponse.json({ ok: true, updated: body.length });
}
