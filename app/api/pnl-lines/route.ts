import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";

// GET /api/pnl-lines — returns detail+subtotal lines for mapping dropdowns
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql`
    SELECT code, label, line_type, parent_code, sort_order
    FROM finanzas.pnl_lines_versioned
    WHERE structure_version_id = (
      SELECT id FROM finanzas.pnl_structure_versions WHERE is_active = true LIMIT 1
    )
      AND is_active = true
      AND show_in_report = TRUE
      AND line_type IN ('detail', 'subtotal')
    ORDER BY sort_order
  `;

  return NextResponse.json(rows);
}
