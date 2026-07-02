import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string; formulaKey: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, formulaKey } = await params;

  const rows = await sql`
    SELECT component_line_code, operator, sort_order
    FROM finanzas.pnl_formula_components_versioned
    WHERE structure_version_id = ${id}::uuid
      AND formula_key = ${formulaKey}
    ORDER BY sort_order, component_line_code
  `;

  return NextResponse.json({
    formulaKey,
    components: rows.map((r) => ({
      componentLineCode: r.component_line_code,
      operator:          r.operator,
      sortOrder:         r.sort_order,
    })),
  });
}

// PATCH replaces ALL components for this formula_key (delete + insert)
export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, formulaKey } = await params;

  const [version] = await sql`
    SELECT status FROM finanzas.pnl_structure_versions WHERE id = ${id}::uuid
  `;
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (version.status !== "draft") {
    return NextResponse.json(
      { error: `No se puede editar una versión con status '${version.status}'` },
      { status: 409 }
    );
  }

  const body = await request.json() as {
    components: { componentLineCode: string; operator: 1 | -1; sortOrder: number }[];
  };

  if (!Array.isArray(body.components)) {
    return NextResponse.json({ error: "components debe ser un array" }, { status: 400 });
  }

  for (const c of body.components) {
    if (!c.componentLineCode?.trim()) {
      return NextResponse.json({ error: "Cada componente requiere componentLineCode" }, { status: 400 });
    }
    if (c.operator !== 1 && c.operator !== -1) {
      return NextResponse.json({ error: "operator debe ser 1 o -1" }, { status: 400 });
    }
  }

  // Replace all: delete existing then insert new
  await sql`
    DELETE FROM finanzas.pnl_formula_components_versioned
    WHERE structure_version_id = ${id}::uuid
      AND formula_key = ${formulaKey}
  `;

  if (body.components.length > 0) {
    const codes   = body.components.map((c) => c.componentLineCode);
    const ops     = body.components.map((c) => c.operator);
    const orders  = body.components.map((c) => c.sortOrder);

    await sql`
      INSERT INTO finanzas.pnl_formula_components_versioned
        (structure_version_id, formula_key, component_line_code, operator, sort_order)
      SELECT
        ${id}::uuid,
        ${formulaKey},
        unnest(${codes}::text[]),
        unnest(${ops}::integer[]),
        unnest(${orders}::integer[])
    `;
  }

  await sql`
    UPDATE finanzas.pnl_structure_versions
    SET updated_at = now(), updated_by = ${user.id}::uuid
    WHERE id = ${id}::uuid
  `;

  await logAudit({
    userId: user.id,
    action: "pnl_formula.update",
    entityType: "pnl_formula_components_versioned",
    metadata: { versionId: id, formulaKey, componentCount: body.components.length },
  });

  return NextResponse.json({ ok: true, formulaKey, componentCount: body.components.length });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, formulaKey } = await params;

  const [version] = await sql`
    SELECT status FROM finanzas.pnl_structure_versions WHERE id = ${id}::uuid
  `;
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (version.status !== "draft") {
    return NextResponse.json(
      { error: `No se puede editar una versión con status '${version.status}'` },
      { status: 409 }
    );
  }

  await sql`
    DELETE FROM finanzas.pnl_formula_components_versioned
    WHERE structure_version_id = ${id}::uuid
      AND formula_key = ${formulaKey}
  `;

  await logAudit({
    userId: user.id,
    action: "pnl_formula.delete",
    entityType: "pnl_formula_components_versioned",
    metadata: { versionId: id, formulaKey },
  });

  return NextResponse.json({ ok: true });
}
