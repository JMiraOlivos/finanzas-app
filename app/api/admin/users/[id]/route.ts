import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";

async function assertAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  const u = session.user as { id: string; role: string };
  return u.role === "admin" ? u : null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await assertAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json() as { role?: string; isActive?: boolean; fullName?: string };
  const { role, isActive, fullName } = body;

  const VALID_ROLES = ["admin", "finance", "director", "partner", "stakeholder"];
  if (role && !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  const updated = await sql`
    UPDATE finanzas.app_users SET
      role      = COALESCE(${role ?? null}, role),
      is_active = COALESCE(${isActive ?? null}, is_active),
      full_name = COALESCE(${fullName ?? null}, full_name)
    WHERE id = ${id}::uuid
    RETURNING id
  `;

  if (!updated.length) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
