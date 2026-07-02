import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

async function getVersionOrFail(id: string) {
  const [v] = await sql`
    SELECT id, status FROM finanzas.pnl_structure_versions WHERE id = ${id}::uuid
  `;
  return v ?? null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const version = await getVersionOrFail(id);
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lines = await sql`
    SELECT id, code, label, parent_code, level, sort_order,
           line_type, formula_key, show_in_report, is_bold, is_highlighted, is_active,
           created_at, updated_at
    FROM finanzas.pnl_lines_versioned
    WHERE structure_version_id = ${id}::uuid
    ORDER BY sort_order ASC
  `;

  return NextResponse.json(lines.map((l) => ({
    id:           l.id,
    code:         l.code,
    label:        l.label,
    parentCode:   l.parent_code ?? null,
    level:        l.level,
    sortOrder:    l.sort_order,
    lineType:     l.line_type,
    formulaKey:   l.formula_key ?? null,
    showInReport: l.show_in_report,
    isBold:       l.is_bold,
    isHighlighted: l.is_highlighted,
    isActive:     l.is_active,
    createdAt:    l.created_at,
    updatedAt:    l.updated_at,
  })));
}

export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const version = await getVersionOrFail(id);
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (version.status !== "draft") {
    return NextResponse.json(
      { error: `No se puede editar una versión con status '${version.status}'` },
      { status: 409 }
    );
  }

  const body = await request.json() as {
    code: string;
    label: string;
    parentCode?: string | null;
    level: number;
    sortOrder: number;
    lineType: "detail" | "subtotal" | "calculated";
    formulaKey?: string | null;
    showInReport?: boolean;
    isBold?: boolean;
    isHighlighted?: boolean;
  };

  if (!body.code?.trim() || !body.label?.trim() || !body.lineType) {
    return NextResponse.json({ error: "code, label y lineType son requeridos" }, { status: 400 });
  }
  if (!["detail", "subtotal", "calculated"].includes(body.lineType)) {
    return NextResponse.json({ error: "lineType inválido" }, { status: 400 });
  }

  const [line] = await sql`
    INSERT INTO finanzas.pnl_lines_versioned
      (structure_version_id, code, label, parent_code, level, sort_order,
       line_type, formula_key, show_in_report, is_bold, is_highlighted)
    VALUES (
      ${id}::uuid,
      ${body.code.trim().toUpperCase()},
      ${body.label.trim()},
      ${body.parentCode ?? null},
      ${body.level},
      ${body.sortOrder},
      ${body.lineType},
      ${body.formulaKey ?? null},
      ${body.showInReport ?? true},
      ${body.isBold ?? false},
      ${body.isHighlighted ?? false}
    )
    RETURNING id, code, label, sort_order, line_type, created_at
  `;

  await sql`
    UPDATE finanzas.pnl_structure_versions
    SET updated_at = now(), updated_by = ${user.id}::uuid
    WHERE id = ${id}::uuid
  `;

  await logAudit({
    userId: user.id,
    action: "pnl_line.create",
    entityType: "pnl_lines_versioned",
    entityId: line.id as string,
    metadata: { versionId: id, code: body.code, label: body.label },
  });

  return NextResponse.json(line, { status: 201 });
}
