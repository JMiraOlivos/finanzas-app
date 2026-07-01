import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await sql`
    SELECT triggered_at, trigger_source, status
    FROM finanzas.dbt_run_history
    ORDER BY triggered_at DESC
    LIMIT 1
  `;

  if (!rows[0]) return NextResponse.json({ lastRun: null });

  return NextResponse.json({
    lastRun: {
      triggeredAt:   rows[0].triggered_at,
      triggerSource: rows[0].trigger_source,
      status:        rows[0].status,
    },
  });
}
