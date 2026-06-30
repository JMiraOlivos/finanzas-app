import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAllowedCompanyIds } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const allowedIds = await getAllowedCompanyIds(user.id, user.role);

  const companies = allowedIds === null
    ? await sql`SELECT id, name, country, base_currency FROM finanzas.companies WHERE is_active = TRUE ORDER BY name`
    : await sql`SELECT id, name, country, base_currency FROM finanzas.companies WHERE id = ANY(${allowedIds}::uuid[]) AND is_active = TRUE ORDER BY name`;

  return NextResponse.json(companies);
}
