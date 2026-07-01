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

  const rows = allowedIds === null
    ? await sql`
        SELECT
          company_id, company_name, period_month,
          status, unmapped_account_count, unmapped_amount, imbalance
        FROM finanzas.dq_financial_control
        WHERE date_trunc('month', period_month) = date_trunc('month', ${period}::date)
        ORDER BY
          CASE status WHEN 'red' THEN 0 WHEN 'yellow' THEN 1 ELSE 2 END,
          company_name
      `
    : await sql`
        SELECT
          company_id, company_name, period_month,
          status, unmapped_account_count, unmapped_amount, imbalance
        FROM finanzas.dq_financial_control
        WHERE date_trunc('month', period_month) = date_trunc('month', ${period}::date)
          AND company_id = ANY(${allowedIds}::uuid[])
        ORDER BY
          CASE status WHEN 'red' THEN 0 WHEN 'yellow' THEN 1 ELSE 2 END,
          company_name
      `;

  return NextResponse.json(
    rows.map((r) => ({
      companyId:            r.company_id,
      companyName:          r.company_name,
      periodMonth:          r.period_month,
      status:               r.status as "green" | "yellow" | "red",
      unmappedAccountCount: Number(r.unmapped_account_count),
      unmappedAmount:       Number(r.unmapped_amount),
      imbalance:            Number(r.imbalance),
    }))
  );
}
