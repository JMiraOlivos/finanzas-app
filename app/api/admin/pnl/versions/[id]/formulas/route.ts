import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const rows = await sql`
    SELECT formula_key, component_line_code, operator, sort_order
    FROM finanzas.pnl_formula_components_versioned
    WHERE structure_version_id = ${id}::uuid
    ORDER BY formula_key, sort_order, component_line_code
  `;

  // Group by formula_key
  const grouped = new Map<string, { componentLineCode: string; operator: number; sortOrder: number }[]>();
  for (const r of rows) {
    const key = r.formula_key as string;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({
      componentLineCode: r.component_line_code as string,
      operator:          r.operator as number,
      sortOrder:         r.sort_order as number,
    });
  }

  return NextResponse.json(
    [...grouped.entries()].map(([formulaKey, components]) => ({ formulaKey, components }))
  );
}
