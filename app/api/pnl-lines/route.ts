import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lines = await sql`
    SELECT id, code, label, parent_code, level, sort_order, line_type
    FROM finanzas.pnl_lines
    WHERE show_in_report = TRUE
    ORDER BY sort_order
  `;
  return NextResponse.json(lines);
}
