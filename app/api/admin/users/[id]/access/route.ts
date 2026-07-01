import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";

async function assertAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  const u = session.user as { id: string; role: string };
  return u.role === "admin" ? u : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await assertAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const rows = await sql`
    SELECT c.id, c.name, uca.can_view, uca.can_export, uca.can_view_movements
    FROM finanzas.companies c
    LEFT JOIN finanzas.user_company_access uca ON uca.company_id = c.id AND uca.user_id = ${id}::uuid
    WHERE c.is_active = TRUE
    ORDER BY c.name
  `;
  return NextResponse.json(rows.map((r) => ({
    companyId:        r.id,
    companyName:      r.name,
    canView:          r.can_view ?? false,
    canExport:        r.can_export ?? false,
    canViewMovements: r.can_view_movements ?? false,
  })));
}

// PUT replaces the full access list for a user
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await assertAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json() as {
    companyId: string; canView: boolean; canExport: boolean; canViewMovements: boolean;
  }[];

  await sql.begin(async (sql) => {
    await sql`DELETE FROM finanzas.user_company_access WHERE user_id = ${id}::uuid`;
    const toInsert = body.filter((r) => r.canView || r.canExport || r.canViewMovements);
    for (const r of toInsert) {
      await sql`
        INSERT INTO finanzas.user_company_access
          (user_id, company_id, can_view, can_export, can_view_movements)
        VALUES
          (${id}::uuid, ${r.companyId}::uuid, ${r.canView}, ${r.canExport}, ${r.canViewMovements})
      `;
    }
  });

  return NextResponse.json({ ok: true });
}
