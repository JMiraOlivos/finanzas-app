import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string; mappingId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, mappingId } = await params;

  const [version] = await sql`
    SELECT status FROM finanzas.pnl_structure_versions WHERE id = ${id}::uuid
  `;
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  if (version.status !== "draft") {
    return NextResponse.json({ error: `No se puede editar una versión con status '${version.status}'` }, { status: 409 });
  }

  const [mapping] = await sql`
    SELECT id FROM finanzas.account_pnl_mappings_versioned
    WHERE id = ${mappingId}::uuid AND structure_version_id = ${id}::uuid
  `;
  if (!mapping) return NextResponse.json({ error: "Mapping not found" }, { status: 404 });

  const body = await request.json() as {
    pnlLineCode?: string;
    signMultiplier?: number;
  };

  await sql`
    UPDATE finanzas.account_pnl_mappings_versioned
    SET
      pnl_line_code   = COALESCE(${body.pnlLineCode ?? null}, pnl_line_code),
      sign_multiplier = COALESCE(${body.signMultiplier ?? null}, sign_multiplier),
      updated_by      = ${user.id}::uuid,
      updated_at      = now()
    WHERE id = ${mappingId}::uuid
  `;

  await logAudit({
    userId: user.id,
    action: "pnl_mapping.update",
    entityType: "account_pnl_mappings_versioned",
    entityId: mappingId,
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

  const { id, mappingId } = await params;

  const [version] = await sql`
    SELECT status FROM finanzas.pnl_structure_versions WHERE id = ${id}::uuid
  `;
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  if (version.status !== "draft") {
    return NextResponse.json({ error: `No se puede editar una versión con status '${version.status}'` }, { status: 409 });
  }

  await sql`
    UPDATE finanzas.account_pnl_mappings_versioned
    SET is_active = false, updated_at = now(), updated_by = ${user.id}::uuid
    WHERE id = ${mappingId}::uuid AND structure_version_id = ${id}::uuid
  `;

  await logAudit({
    userId: user.id,
    action: "pnl_mapping.delete",
    entityType: "account_pnl_mappings_versioned",
    entityId: mappingId,
    metadata: { versionId: id },
  });

  return NextResponse.json({ ok: true });
}
