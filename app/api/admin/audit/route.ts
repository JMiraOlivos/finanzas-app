import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page    = Math.max(1, Number(searchParams.get("page") ?? 1));
  const action  = searchParams.get("action") ?? "";
  const limit   = 50;
  const offset  = (page - 1) * limit;

  const rows = action
    ? await sql`
        SELECT al.id, al.created_at, al.action, al.entity_type, al.entity_id, al.metadata,
               u.email, u.full_name
        FROM finanzas.audit_log al
        LEFT JOIN finanzas.app_users u ON u.id = al.user_id
        WHERE al.action = ${action}
        ORDER BY al.created_at DESC
        LIMIT ${limit} OFFSET ${offset}`
    : await sql`
        SELECT al.id, al.created_at, al.action, al.entity_type, al.entity_id, al.metadata,
               u.email, u.full_name
        FROM finanzas.audit_log al
        LEFT JOIN finanzas.app_users u ON u.id = al.user_id
        ORDER BY al.created_at DESC
        LIMIT ${limit} OFFSET ${offset}`;

  const [{ total }] = action
    ? await sql`SELECT COUNT(*)::int AS total FROM finanzas.audit_log WHERE action = ${action}`
    : await sql`SELECT COUNT(*)::int AS total FROM finanzas.audit_log`;

  return NextResponse.json({
    rows: rows.map((r) => ({
      id:         r.id,
      createdAt:  r.created_at,
      action:     r.action,
      entityType: r.entity_type,
      entityId:   r.entity_id,
      metadata:   r.metadata,
      userEmail:  r.email,
      userName:   r.full_name,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
