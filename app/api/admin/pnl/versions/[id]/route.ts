import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

function authGuard(session: Awaited<ReturnType<typeof auth>>) {
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return user;
}

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  const result = authGuard(session);
  if (result instanceof NextResponse) return result;

  const { id } = await params;

  const [version] = await sql`
    SELECT
      v.id, v.name, v.description, v.status, v.is_active,
      v.effective_from, v.effective_to, v.source_version_id,
      v.created_at, v.updated_at, v.published_at, v.archived_at, v.notes,
      cb.email AS created_by_email,
      pb.email AS published_by_email,
      ab.email AS archived_by_email
    FROM finanzas.pnl_structure_versions v
    LEFT JOIN finanzas.app_users cb ON cb.id = v.created_by
    LEFT JOIN finanzas.app_users pb ON pb.id = v.published_by
    LEFT JOIN finanzas.app_users ab ON ab.id = v.archived_by
    WHERE v.id = ${id}::uuid
  `;

  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id:               version.id,
    name:             version.name,
    description:      version.description ?? null,
    status:           version.status,
    isActive:         version.is_active,
    effectiveFrom:    version.effective_from ?? null,
    effectiveTo:      version.effective_to ?? null,
    sourceVersionId:  version.source_version_id ?? null,
    createdAt:        version.created_at,
    updatedAt:        version.updated_at,
    publishedAt:      version.published_at ?? null,
    archivedAt:       version.archived_at ?? null,
    notes:            version.notes ?? null,
    createdByEmail:   version.created_by_email ?? null,
    publishedByEmail: version.published_by_email ?? null,
    archivedByEmail:  version.archived_by_email ?? null,
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth();
  const result = authGuard(session);
  if (result instanceof NextResponse) return result;
  const user = result;

  const { id } = await params;

  const [version] = await sql`
    SELECT id, status FROM finanzas.pnl_structure_versions WHERE id = ${id}::uuid
  `;
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (version.status !== "draft") {
    return NextResponse.json(
      { error: `No se puede editar una versión con status '${version.status}'` },
      { status: 409 }
    );
  }

  const body = await request.json() as {
    name?: string;
    description?: string;
    notes?: string;
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
  };

  await sql`
    UPDATE finanzas.pnl_structure_versions
    SET
      name          = COALESCE(${body.name?.trim() ?? null}, name),
      description   = COALESCE(${body.description ?? null}, description),
      notes         = COALESCE(${body.notes ?? null}, notes),
      effective_from = CASE WHEN ${body.effectiveFrom !== undefined} THEN ${body.effectiveFrom ?? null} ELSE effective_from END,
      effective_to   = CASE WHEN ${body.effectiveTo !== undefined} THEN ${body.effectiveTo ?? null} ELSE effective_to END,
      updated_by    = ${user.id}::uuid,
      updated_at    = now()
    WHERE id = ${id}::uuid
  `;

  await logAudit({
    userId: user.id,
    action: "pnl_version.update",
    entityType: "pnl_structure_versions",
    entityId: id,
    metadata: body,
  });

  return NextResponse.json({ ok: true });
}
