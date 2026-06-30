import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAllowedCompanyIds } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");
  if (!period) return NextResponse.json({ error: "Missing period" }, { status: 400 });

  const allowedIds = await getAllowedCompanyIds(user.id, user.role);

  const kpis = allowedIds === null
    ? await sql`SELECT * FROM finanzas.fn_dashboard_kpis(${period}::date, NULL)`
    : await sql`SELECT * FROM finanzas.fn_dashboard_kpis(${period}::date, ${allowedIds}::uuid[])`;

  return NextResponse.json(
    kpis.map((r) => ({
      code:   r.metric_code,
      label:  r.metric_label,
      value:  r.metric_value !== null ? Number(r.metric_value) : null,
      format: r.metric_format,
    }))
  );
}
