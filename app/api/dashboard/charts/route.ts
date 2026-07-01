import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAllowedCompanyIds } from "@/lib/permissions";

const MONTH_LABELS: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

const EXPENSE_CODES = [
  { code: "RRHH",             label: "RRHH" },
  { code: "GASTOS_VARIABLES", label: "Gastos Var." },
  { code: "MARKETING",        label: "Marketing" },
  { code: "GASTOS_ADMIN",     label: "Adm." },
  { code: "ASESORIAS",        label: "Asesorías" },
  { code: "GASTOS_OFICINA",   label: "Oficina" },
  { code: "TECNOLOGIA",       label: "Tecnología" },
];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");
  if (!period) return NextResponse.json({ error: "Missing period" }, { status: 400 });

  const year = Number(period.slice(0, 4));
  const allowedIds = await getAllowedCompanyIds(user.id, user.role);

  const [monthlyData, ytdData] = await Promise.all([
    allowedIds === null
      ? sql`SELECT line_code,
                   EXTRACT(MONTH FROM period_month)::int AS month_num,
                   SUM(amount) AS amount
            FROM (SELECT * FROM finanzas.fn_pnl_monthly(${year}, NULL)) AS sub
            WHERE line_code IN ('INGRESOS','EBITDA')
            GROUP BY line_code, month_num`
      : sql`SELECT line_code,
                   EXTRACT(MONTH FROM period_month)::int AS month_num,
                   SUM(amount) AS amount
            FROM (SELECT * FROM finanzas.fn_pnl_monthly(${year}, ${allowedIds}::uuid[])) AS sub
            WHERE line_code IN ('INGRESOS','EBITDA')
            GROUP BY line_code, month_num`,
    allowedIds === null
      ? sql`SELECT company_id, company_name, line_code, amount
            FROM finanzas.fn_pnl_ytd(${period}::date, NULL)
            WHERE line_code IN ('INGRESOS','RRHH','GASTOS_VARIABLES','MARKETING',
                                'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA')`
      : sql`SELECT company_id, company_name, line_code, amount
            FROM finanzas.fn_pnl_ytd(${period}::date, ${allowedIds}::uuid[])
            WHERE line_code IN ('INGRESOS','RRHH','GASTOS_VARIABLES','MARKETING',
                                'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA')`,
  ]);

  // Monthly trend: sum across companies per month
  const byMonth = new Map<string, { revenue: number; ebitda: number }>();
  for (let m = 1; m <= 12; m++) {
    byMonth.set(String(m).padStart(2, "0"), { revenue: 0, ebitda: 0 });
  }
  for (const row of monthlyData) {
    const month = String(Number(row.month_num)).padStart(2, "0");
    const amount = Number(row.amount) || 0;
    const entry = byMonth.get(month);
    if (!entry) continue;
    if (row.line_code === "INGRESOS") entry.revenue += amount;
    else if (row.line_code === "EBITDA") entry.ebitda += amount;
  }
  const months = Array.from(byMonth.keys()).sort();
  const monthly = {
    labels: months.map((m) => MONTH_LABELS[m] ?? m),
    revenue: months.map((m) => byMonth.get(m)!.revenue),
    ebitda:  months.map((m) => byMonth.get(m)!.ebitda),
  };

  // Expense breakdown: sum across companies per category
  const expenseMap = new Map<string, number>(EXPENSE_CODES.map((e) => [e.code, 0]));
  for (const row of ytdData) {
    const code = row.line_code as string;
    if (expenseMap.has(code)) {
      expenseMap.set(code, (expenseMap.get(code) ?? 0) + Number(row.amount));
    }
  }
  const expenses = {
    labels: EXPENSE_CODES.map((e) => e.label),
    values: EXPENSE_CODES.map((e) => Math.abs(expenseMap.get(e.code) ?? 0)),
  };

  // Company comparison: INGRESOS per company
  const companyMap = new Map<string, { name: string; revenue: number }>();
  for (const row of ytdData) {
    if (row.line_code !== "INGRESOS") continue;
    const id = row.company_id as string;
    if (!companyMap.has(id)) {
      companyMap.set(id, { name: row.company_name as string, revenue: 0 });
    }
    companyMap.get(id)!.revenue += Number(row.amount);
  }
  const companies = Array.from(companyMap.values())
    .filter((c) => c.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  return NextResponse.json({ monthly, expenses, companies });
}
