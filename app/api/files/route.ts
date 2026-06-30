import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin, getAllowedCompanyIds } from "@/lib/permissions";
import { sql } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!isAdmin(user.role) && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowedIds = await getAllowedCompanyIds(user.id, user.role);

  const rows = companyId
    ? await sql`
        SELECT uf.id, uf.original_filename, uf.period_month, uf.status,
               uf.row_count, uf.total_debit, uf.total_credit, uf.error_message,
               uf.created_at, c.name AS company_name
        FROM finanzas.uploaded_files uf
        JOIN finanzas.companies c ON c.id = uf.company_id
        WHERE uf.company_id = ${companyId}::uuid
        ORDER BY uf.created_at DESC
        LIMIT 100`
    : allowedIds === null
      ? await sql`
          SELECT uf.id, uf.original_filename, uf.period_month, uf.status,
                 uf.row_count, uf.total_debit, uf.total_credit, uf.error_message,
                 uf.created_at, c.name AS company_name
          FROM finanzas.uploaded_files uf
          JOIN finanzas.companies c ON c.id = uf.company_id
          ORDER BY uf.created_at DESC
          LIMIT 100`
      : await sql`
          SELECT uf.id, uf.original_filename, uf.period_month, uf.status,
                 uf.row_count, uf.total_debit, uf.total_credit, uf.error_message,
                 uf.created_at, c.name AS company_name
          FROM finanzas.uploaded_files uf
          JOIN finanzas.companies c ON c.id = uf.company_id
          WHERE uf.company_id = ANY(${allowedIds}::uuid[])
          ORDER BY uf.created_at DESC
          LIMIT 100`;

  return NextResponse.json(rows);
}
