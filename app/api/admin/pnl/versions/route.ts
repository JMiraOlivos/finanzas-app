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

export async function GET() {
  const session = await auth();
  const result = authGuard(session);
  if (result instanceof NextResponse) return result;

  const rows = await sql`
    SELECT
      v.id, v.name, v.description, v.status, v.is_active,
      v.effective_from, v.effective_to,
      v.created_at, v.updated_at, v.published_at, v.archived_at,
      v.notes,
      cb.email AS created_by_email,
      pb.email AS published_by_email,
      (SELECT COUNT(*) FROM finanzas.pnl_lines_versioned l
       WHERE l.structure_version_id = v.id AND l.is_active = true) AS line_count
    FROM finanzas.pnl_structure_versions v
    LEFT JOIN finanzas.app_users cb ON cb.id = v.created_by
    LEFT JOIN finanzas.app_users pb ON pb.id = v.published_by
    ORDER BY v.created_at DESC
  `;

  return NextResponse.json(rows.map((r) => ({
    id:             r.id,
    name:           r.name,
    description:    r.description ?? null,
    status:         r.status,
    isActive:       r.is_active,
    effectiveFrom:  r.effective_from ?? null,
    effectiveTo:    r.effective_to ?? null,
    createdAt:      r.created_at,
    updatedAt:      r.updated_at,
    publishedAt:    r.published_at ?? null,
    archivedAt:     r.archived_at ?? null,
    notes:          r.notes ?? null,
    createdByEmail: r.created_by_email ?? null,
    publishedByEmail: r.published_by_email ?? null,
    lineCount:      Number(r.line_count),
  })));
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const result = authGuard(session);
  if (result instanceof NextResponse) return result;
  const user = result;

  const body = await request.json() as {
    name: string;
    description?: string;
    notes?: string;
    effectiveFrom?: string;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name es requerido" }, { status: 400 });
  }

  const [version] = await sql`
    INSERT INTO finanzas.pnl_structure_versions
      (name, description, notes, effective_from, status, is_active, created_by)
    VALUES (
      ${body.name.trim()},
      ${body.description ?? null},
      ${body.notes ?? null},
      ${body.effectiveFrom ?? null},
      'draft',
      false,
      ${user.id}::uuid
    )
    RETURNING id, name, status, created_at
  `;

  await logAudit({
    userId: user.id,
    action: "pnl_version.create",
    entityType: "pnl_structure_versions",
    entityId: version.id as string,
    metadata: { name: body.name },
  });

  return NextResponse.json(version, { status: 201 });
}
