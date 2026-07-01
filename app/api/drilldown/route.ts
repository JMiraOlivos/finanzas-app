import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { assertCanViewCompany, canViewMovements } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { searchParams } = new URL(request.url);

  const companyId    = searchParams.get("companyId");
  const period       = searchParams.get("period");       // "YYYY-MM-DD"
  const pnlLineCode  = searchParams.get("pnlLineCode");  // text code e.g. "INGRESOS"
  const viewMode     = searchParams.get("viewMode") ?? "ytd";

  if (!companyId || !period || !pnlLineCode) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  if (!canViewMovements(user.role)) {
    return NextResponse.json({ error: "Forbidden: your role cannot view movements" }, { status: 403 });
  }

  try {
    await assertCanViewCompany(user.id, user.role, companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await sql`
    SELECT * FROM finanzas.fn_pnl_drilldown(
      ${companyId}::uuid,
      ${period}::date,
      ${pnlLineCode},
      ${viewMode}
    )
  `;

  // Group by account for summary
  const accountMap = new Map<string, { accountCode: string; accountName: string | null; amount: number; movementCount: number }>();
  for (const r of rows) {
    const code = r.account_code as string;
    if (!accountMap.has(code)) {
      accountMap.set(code, { accountCode: code, accountName: r.account_name as string | null, amount: 0, movementCount: 0 });
    }
    const a = accountMap.get(code)!;
    a.amount += Number(r.pnl_amount);
    a.movementCount += 1;
  }

  await logAudit({
    userId: user.id,
    action: "view_drilldown",
    entityType: "pnl_line",
    metadata: { company_id: companyId, period, pnl_line_code: pnlLineCode, view_mode: viewMode },
  });

  return NextResponse.json({
    accounts: Array.from(accountMap.values()).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    movements: rows.map((r) => ({
      journalEntryId: r.journal_entry_id,
      entryDate:      r.entry_date,
      periodMonth:    r.period_month,
      accountCode:    r.account_code,
      accountName:    r.account_name,
      description:    r.description,
      documentNumber: r.document_number,
      debit:          Number(r.debit),
      credit:         Number(r.credit),
      pnlAmount:      Number(r.pnl_amount),
      pnlLineCode:    r.pnl_line_code,
      pnlLineLabel:   r.pnl_line_label,
    })),
  });
}
