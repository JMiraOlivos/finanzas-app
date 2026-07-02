import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

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

  // ?unmapped=1 → cuentas P&L sin mapping en esta versión
  if (searchParams.get("unmapped") === "1") {
    const rows = await sql`
      SELECT
        je.company_id,
        c.name          AS company_name,
        je.account_code,
        MAX(je.account_name)    AS account_name,
        COUNT(*)::int           AS movement_count,
        SUM(ABS(je.amount))     AS total_amount
      FROM finanzas.journal_entries je
      JOIN finanzas.uploaded_files uf ON uf.id = je.uploaded_file_id
      JOIN finanzas.companies c       ON c.id  = je.company_id
      WHERE je.is_pnl = true
        AND uf.status = 'processed'
        AND NOT EXISTS (
          SELECT 1
          FROM finanzas.account_pnl_mappings_versioned m
          WHERE m.structure_version_id = ${id}::uuid
            AND m.account_code = je.account_code
            AND (m.company_id IS NULL OR m.company_id = je.company_id)
            AND m.is_active = true
        )
      GROUP BY je.company_id, c.name, je.account_code
      ORDER BY SUM(ABS(je.amount)) DESC NULLS LAST
    `;
    return NextResponse.json(rows.map((r) => ({
      companyId:     r.company_id,
      companyName:   r.company_name,
      accountCode:   r.account_code,
      accountName:   r.account_name ?? null,
      movementCount: Number(r.movement_count),
      totalAmount:   Number(r.total_amount),
    })));
  }

  // Default → mappings existentes de la versión
  const rows = await sql`
    SELECT
      m.id, m.company_id, c.name AS company_name,
      m.account_code,
      COALESCE(m.account_name, je.account_name) AS account_name,
      m.pnl_line_code,
      m.sign_multiplier, m.is_active, m.created_at, m.updated_at
    FROM finanzas.account_pnl_mappings_versioned m
    LEFT JOIN finanzas.companies c ON c.id = m.company_id
    LEFT JOIN LATERAL (
      SELECT account_name
      FROM finanzas.journal_entries
      WHERE account_code = m.account_code
        AND account_name IS NOT NULL
      LIMIT 1
    ) je ON true
    WHERE m.structure_version_id = ${id}::uuid
    ORDER BY m.account_code, c.name NULLS FIRST
  `;

  return NextResponse.json(rows.map((r) => ({
    id:             r.id,
    companyId:      r.company_id ?? null,
    companyName:    r.company_name ?? null,
    accountCode:    r.account_code,
    accountName:    r.account_name ?? null,
    pnlLineCode:    r.pnl_line_code,
    signMultiplier: r.sign_multiplier,
    isActive:       r.is_active,
    createdAt:      r.created_at,
    updatedAt:      r.updated_at,
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

  const [version] = await sql`
    SELECT status FROM finanzas.pnl_structure_versions WHERE id = ${id}::uuid
  `;
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (version.status !== "draft") {
    return NextResponse.json({ error: `No se puede editar una versión con status '${version.status}'` }, { status: 409 });
  }

  const body = await request.json() as {
    companyId?: string | null;
    accountCode: string;
    accountName?: string | null;
    pnlLineCode: string;
    signMultiplier?: number;
  };

  if (!body.accountCode?.trim() || !body.pnlLineCode?.trim()) {
    return NextResponse.json({ error: "accountCode y pnlLineCode son requeridos" }, { status: 400 });
  }

  // Deactivate any existing mapping for this (version, company, account) combo
  await sql`
    UPDATE finanzas.account_pnl_mappings_versioned
    SET is_active = false, updated_at = now(), updated_by = ${user.id}::uuid
    WHERE structure_version_id = ${id}::uuid
      AND account_code = ${body.accountCode}
      AND (company_id IS NOT DISTINCT FROM ${body.companyId ?? null}::uuid)
      AND is_active = true
  `;

  const [mapping] = await sql`
    INSERT INTO finanzas.account_pnl_mappings_versioned
      (structure_version_id, company_id, account_code, account_name,
       pnl_line_code, sign_multiplier, created_by, updated_by)
    VALUES (
      ${id}::uuid,
      ${body.companyId ?? null}::uuid,
      ${body.accountCode},
      ${body.accountName ?? null},
      ${body.pnlLineCode},
      ${body.signMultiplier ?? 1},
      ${user.id}::uuid,
      ${user.id}::uuid
    )
    RETURNING id, account_code, pnl_line_code, created_at
  `;

  await logAudit({
    userId: user.id,
    action: "pnl_mapping.create",
    entityType: "account_pnl_mappings_versioned",
    entityId: mapping.id as string,
    metadata: { versionId: id, accountCode: body.accountCode, pnlLineCode: body.pnlLineCode },
  });

  return NextResponse.json(mapping, { status: 201 });
}
