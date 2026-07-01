import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { id } = await params;

  const [existing] = await sql`
    SELECT id, created_by FROM finanzas.financial_comments WHERE id = ${id}::uuid`;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = existing.created_by === user.id;
  if (!isOwner && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as { comment?: string; visibility?: "internal" | "board" };
  const { comment, visibility } = body;

  if (!comment?.trim() && !visibility) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await sql`
    UPDATE finanzas.financial_comments
    SET
      comment    = COALESCE(${comment?.trim() ?? null}, comment),
      visibility = COALESCE(${visibility ?? null}, visibility),
      updated_at = now()
    WHERE id = ${id}::uuid`;

  await logAudit({
    userId: user.id,
    action: "comment.update",
    entityType: "financial_comments",
    entityId: id,
    metadata: { comment, visibility },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [existing] = await sql`
    SELECT id FROM finanzas.financial_comments WHERE id = ${id}::uuid`;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await sql`DELETE FROM finanzas.financial_comments WHERE id = ${id}::uuid`;

  await logAudit({
    userId: user.id,
    action: "comment.delete",
    entityType: "financial_comments",
    entityId: id,
  });

  return NextResponse.json({ ok: true });
}
