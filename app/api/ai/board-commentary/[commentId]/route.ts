import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type { BoardCommentaryData } from "../route";

type PatchBody = {
  body?: string;
  status?: "approved" | "draft";
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { commentId } = await params;

  // Verify the comment exists and belongs to AI source
  const [existing] = await sql`
    SELECT id, source FROM finanzas.financial_comments WHERE id = ${commentId}::uuid
  `;
  if (!existing || existing.source !== "ai") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let patchBody: PatchBody;
  try {
    patchBody = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { body: newText, status: newStatus } = patchBody;

  if (!newText?.trim() && !newStatus) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  let rows: Array<Record<string, unknown>>;

  if (newStatus === "approved") {
    const text = newText?.trim();
    if (text) {
      rows = await sql`
        UPDATE finanzas.financial_comments
        SET comment     = ${text},
            status      = 'approved',
            approved_by = ${user.id}::uuid,
            approved_at = now()
        WHERE id = ${commentId}::uuid AND source = 'ai'
        RETURNING id, comment, status, approved_by, approved_at, created_at
      `;
    } else {
      rows = await sql`
        UPDATE finanzas.financial_comments
        SET status      = 'approved',
            approved_by = ${user.id}::uuid,
            approved_at = now()
        WHERE id = ${commentId}::uuid AND source = 'ai'
        RETURNING id, comment, status, approved_by, approved_at, created_at
      `;
    }
  } else if (newStatus === "draft") {
    // Revoke approval
    rows = await sql`
      UPDATE finanzas.financial_comments
      SET status      = 'draft',
          approved_by = NULL,
          approved_at = NULL
      WHERE id = ${commentId}::uuid AND source = 'ai'
      RETURNING id, comment, status, approved_by, approved_at, created_at
    `;
  } else {
    // Text-only update
    const text = newText!.trim();
    rows = await sql`
      UPDATE finanzas.financial_comments
      SET comment = ${text}
      WHERE id = ${commentId}::uuid AND source = 'ai'
      RETURNING id, comment, status, approved_by, approved_at, created_at
    `;
  }

  const r = rows[0];
  if (!r) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  void logAudit({
    userId:     user.id,
    action:     newStatus === "approved" ? "ai_board_commentary.approve" : "ai_board_commentary.update",
    entityType: "financial_comments",
    entityId:   commentId,
    metadata:   { newStatus: newStatus ?? "text_update" },
  });

  // Fetch approver email if approved
  let approvedByEmail: string | null = null;
  if (r.approved_by) {
    const [approver] = await sql`SELECT email FROM finanzas.app_users WHERE id = ${String(r.approved_by)}::uuid`;
    approvedByEmail = approver?.email ? String(approver.email) : null;
  }

  return NextResponse.json({
    id:         String(r.id),
    comment:    String(r.comment),
    status:     r.status as "draft" | "approved",
    approvedAt: r.approved_at ? String(r.approved_at) : null,
    approvedBy: approvedByEmail,
    createdAt:  String(r.created_at),
    canApprove: true,
  } satisfies BoardCommentaryData);
}
