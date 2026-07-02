import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period"); // "YYYY-MM"

  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json(
      { error: "Parámetro period requerido (formato YYYY-MM)" },
      { status: 400 }
    );
  }

  const periodDate = `${period}-01`;

  const [version] = await sql`
    SELECT id, name, status
    FROM finanzas.pnl_structure_versions
    WHERE id = ${id}::uuid
  `;
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Find the currently active published version (may be different from requested id,
  // or may not exist yet if this is the first publish)
  const [activeVersion] = await sql`
    SELECT id, name
    FROM finanzas.pnl_structure_versions
    WHERE is_active = true AND status = 'published'
  `;

  function mapRow(r: Record<string, unknown>) {
    return {
      pnlLineCode:  r.pnl_line_code,
      pnlLineLabel: r.pnl_line_label,
      lineType:     r.line_type,
      sortOrder:    r.sort_order,
      parentCode:   r.parent_code ?? null,
      level:        r.level,
      amountYtd:    r.amount_ytd !== null ? Number(r.amount_ytd) : null,
    };
  }

  // YTD for the requested (draft) version
  const draftRows = await sql`
    SELECT * FROM finanzas.fn_pnl_ytd_for_structure_version(
      ${periodDate}::date,
      ${id}::uuid
    )
  `;

  // YTD for the active published version (only if it differs from the requested one)
  let activeRows: ReturnType<typeof mapRow>[] | null = null;
  if (activeVersion && activeVersion.id !== id) {
    const rows = await sql`
      SELECT * FROM finanzas.fn_pnl_ytd_for_structure_version(
        ${periodDate}::date,
        ${activeVersion.id as string}::uuid
      )
    `;
    activeRows = rows.map(mapRow);
  }

  return NextResponse.json({
    period:        periodDate,
    draftVersion:  { id: version.id, name: version.name, status: version.status },
    activeVersion: activeVersion && activeVersion.id !== id
      ? { id: activeVersion.id, name: activeVersion.name }
      : null,
    draft:         draftRows.map(mapRow),
    active:        activeRows,
  });
}
