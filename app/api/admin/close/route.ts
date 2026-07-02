import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export type PeriodClose = {
  id:                      string;
  periodMonth:             string;
  status:                  "draft" | "closed" | "published";
  closedBy:                string | null;
  closedAt:                string | null;
  publishedBy:             string | null;
  publishedAt:             string | null;
  notes:                   string | null;
  pnlStructureVersionId:   string | null;
  pnlStructureVersionName: string | null;
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");

  const rows = period
    ? await sql`
        SELECT fpc.id, fpc.period_month, fpc.status,
               cb.email AS closed_by, fpc.closed_at,
               pb.email AS published_by, fpc.published_at, fpc.notes,
               fpc.pnl_structure_version_id,
               psv.name AS pnl_structure_version_name
        FROM finanzas.financial_period_closes fpc
        LEFT JOIN finanzas.app_users cb ON cb.id = fpc.closed_by
        LEFT JOIN finanzas.app_users pb ON pb.id = fpc.published_by
        LEFT JOIN finanzas.pnl_structure_versions psv ON psv.id = fpc.pnl_structure_version_id
        WHERE fpc.period_month = date_trunc('month', ${period}::date)::date`
    : await sql`
        SELECT fpc.id, fpc.period_month, fpc.status,
               cb.email AS closed_by, fpc.closed_at,
               pb.email AS published_by, fpc.published_at, fpc.notes,
               fpc.pnl_structure_version_id,
               psv.name AS pnl_structure_version_name
        FROM finanzas.financial_period_closes fpc
        LEFT JOIN finanzas.app_users cb ON cb.id = fpc.closed_by
        LEFT JOIN finanzas.app_users pb ON pb.id = fpc.published_by
        LEFT JOIN finanzas.pnl_structure_versions psv ON psv.id = fpc.pnl_structure_version_id
        ORDER BY fpc.period_month DESC
        LIMIT 24`;

  return NextResponse.json(
    rows.map((r) => ({
      id:                      r.id,
      periodMonth:             r.period_month,
      status:                  r.status,
      closedBy:                r.closed_by ?? null,
      closedAt:                r.closed_at ?? null,
      publishedBy:             r.published_by ?? null,
      publishedAt:             r.published_at ?? null,
      notes:                   r.notes ?? null,
      pnlStructureVersionId:   r.pnl_structure_version_id ?? null,
      pnlStructureVersionName: r.pnl_structure_version_name ?? null,
    } as PeriodClose))
  );
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as {
    period_month: string;
    action: "close" | "publish" | "reopen";
    notes?: string;
  };

  const { period_month, action, notes } = body;
  if (!period_month || !action) {
    return NextResponse.json({ error: "period_month and action are required" }, { status: 400 });
  }

  if (!["close", "publish", "reopen"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Fetch current state (upsert default draft if missing)
  const [existing] = await sql`
    INSERT INTO finanzas.financial_period_closes (period_month)
    VALUES (date_trunc('month', ${period_month}::date)::date)
    ON CONFLICT (period_month) DO NOTHING
    RETURNING id, status`;

  const [current] = await sql`
    SELECT id, status FROM finanzas.financial_period_closes
    WHERE period_month = date_trunc('month', ${period_month}::date)::date`;

  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Validate transition
  const validTransitions: Record<string, string> = {
    close:   "draft",
    publish: "closed",
    reopen:  "closed",
  };
  if (current.status !== validTransitions[action]) {
    return NextResponse.json(
      { error: `Cannot ${action} a period in status '${current.status}'` },
      { status: 409 }
    );
  }

  // Apply transition
  if (action === "close") {
    await sql`
      UPDATE finanzas.financial_period_closes
      SET status = 'closed', closed_by = ${user.id}::uuid, closed_at = now(),
          notes = COALESCE(${notes ?? null}, notes)
      WHERE id = ${current.id}::uuid`;
  } else if (action === "publish") {
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Only admin can publish" }, { status: 403 });
    }
    // Stamp the active P&L structure version so historical board packs remain reproducible
    await sql`
      UPDATE finanzas.financial_period_closes
      SET
        status                   = 'published',
        published_by             = ${user.id}::uuid,
        published_at             = now(),
        notes                    = COALESCE(${notes ?? null}, notes),
        pnl_structure_version_id = (
          SELECT id FROM finanzas.pnl_structure_versions
          WHERE is_active = true AND status = 'published'
          LIMIT 1
        )
      WHERE id = ${current.id}::uuid`;
  } else {
    // reopen → back to draft (admin only)
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Only admin can reopen" }, { status: 403 });
    }
    await sql`
      UPDATE finanzas.financial_period_closes
      SET status = 'draft', notes = COALESCE(${notes ?? null}, notes)
      WHERE id = ${current.id}::uuid`;
  }

  await logAudit({
    userId: user.id,
    action: `period.${action}`,
    entityType: "financial_period_closes",
    entityId: current.id as string,
    metadata: { period_month, action, notes },
  });

  return NextResponse.json({ ok: true, period_month, action });
}
