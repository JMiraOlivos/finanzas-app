import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import bcrypt from "bcryptjs";

async function assertAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin") return null;
  return user;
}

export async function GET() {
  const user = await assertAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await sql`
    SELECT
      u.id, u.email, u.full_name, u.role, u.is_active, u.created_at,
      COUNT(uca.company_id)::int AS company_count
    FROM finanzas.app_users u
    LEFT JOIN finanzas.user_company_access uca ON uca.user_id = u.id
    GROUP BY u.id, u.email, u.full_name, u.role, u.is_active, u.created_at
    ORDER BY u.created_at DESC
  `;

  return NextResponse.json(rows.map((r) => ({
    id:           r.id,
    email:        r.email,
    fullName:     r.full_name,
    role:         r.role,
    isActive:     r.is_active,
    createdAt:    r.created_at,
    companyCount: r.company_count,
  })));
}

export async function POST(request: NextRequest) {
  const user = await assertAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as { email?: string; fullName?: string; role?: string; password?: string };
  const { email, fullName, role, password } = body;

  if (!email || !role || !password) {
    return NextResponse.json({ error: "email, role y password son requeridos" }, { status: 400 });
  }
  const VALID_ROLES = ["admin", "finance", "director", "partner", "stakeholder"];
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `Rol inválido. Opciones: ${VALID_ROLES.join(", ")}` }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 12);

  try {
    const [newUser] = await sql<{ id: string }[]>`
      INSERT INTO finanzas.app_users (email, full_name, role, password_hash)
      VALUES (${email.toLowerCase().trim()}, ${fullName ?? null}, ${role}, ${hash})
      RETURNING id
    `;
    return NextResponse.json({ id: newUser.id }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("unique")) return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
