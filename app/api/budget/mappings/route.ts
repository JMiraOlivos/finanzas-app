import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { sql } from "@/lib/db";
import { triggerDbtRun } from "@/lib/dbt";

// GET /api/budget/mappings?versionId=X
// Returns unique account names in staging for that version, with mapping status.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { role: string };
  if (!isAdmin(user.role) && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const versionId = new URL(request.url).searchParams.get("versionId");
  if (!versionId) return NextResponse.json({ error: "Missing versionId" }, { status: 400 });

  // Distinct account names in staging for this version + their current mapping if any
  const rows = await sql`
    SELECT
      s.account_name,
      s.company_id,
      c.name AS company_name,
      bam.pnl_line_id,
      pl.code  AS pnl_line_code,
      pl.label AS pnl_line_label
    FROM (
      SELECT DISTINCT account_name, company_id
      FROM finanzas.budget_staging
      WHERE version_id = ${versionId}::uuid
    ) s
    JOIN finanzas.companies c ON c.id = s.company_id
    LEFT JOIN finanzas.budget_account_mappings bam
      ON bam.is_active = TRUE
      AND LOWER(bam.account_name) = LOWER(s.account_name)
      AND (bam.company_id = s.company_id OR bam.company_id IS NULL)
    LEFT JOIN finanzas.pnl_lines pl ON pl.id = bam.pnl_line_id
    ORDER BY s.company_id, s.account_name
  `;

  return NextResponse.json(rows);
}

// POST /api/budget/mappings
// Body: { versionId: string, mappings: { accountName: string, pnlLineId: string, companyId: string }[] }
// Saves mappings + applies them to staging → commits to budget_monthly.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  if (!isAdmin(user.role) && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as {
    versionId: string;
    mappings: { accountName: string; pnlLineId: string; companyId: string }[];
  };

  if (!body.versionId || !Array.isArray(body.mappings) || body.mappings.length === 0) {
    return NextResponse.json({ error: "versionId and mappings[] required" }, { status: 400 });
  }

  try {
    const result = await sql.begin(async (tx) => {
      // 1. Upsert budget_account_mappings
      for (const m of body.mappings) {
        await tx`
          INSERT INTO finanzas.budget_account_mappings
            (account_name, company_id, pnl_line_id, created_by)
          VALUES
            (${m.accountName}, ${m.companyId}::uuid, ${m.pnlLineId}::uuid, ${user.id}::uuid)
          ON CONFLICT (account_name, company_id)
          DO UPDATE SET
            pnl_line_id = EXCLUDED.pnl_line_id,
            is_active   = TRUE,
            created_by  = EXCLUDED.created_by,
            created_at  = now()
        `;
      }

      // 2. Build resolve map from all active mappings for this version's companies
      const stagingCompanies = await tx<{ company_id: string }[]>`
        SELECT DISTINCT company_id FROM finanzas.budget_staging
        WHERE version_id = ${body.versionId}::uuid
      `;
      const companyIds = stagingCompanies.map((r) => r.company_id);

      const allMappings = await tx<{ account_name: string; company_id: string | null; pnl_line_id: string }[]>`
        SELECT account_name, company_id, pnl_line_id
        FROM finanzas.budget_account_mappings
        WHERE is_active = TRUE
          AND (company_id IS NULL OR company_id = ANY(${companyIds}::uuid[]))
      `;

      const globalMap   = new Map<string, string>();
      const companyMap2 = new Map<string, string>();
      for (const m of allMappings) {
        if (m.company_id === null) globalMap.set(m.account_name.toLowerCase(), m.pnl_line_id);
        else companyMap2.set(`${m.account_name.toLowerCase()}|${m.company_id}`, m.pnl_line_id);
      }
      const resolve = (name: string, cid: string) =>
        companyMap2.get(`${name.toLowerCase()}|${cid}`) ??
        globalMap.get(name.toLowerCase()) ??
        null;

      // 3. Read staging rows for this version
      const staging = await tx<{ company_id: string; account_name: string; period_month: string; amount: string }[]>`
        SELECT company_id, account_name, period_month::text, amount::text
        FROM finanzas.budget_staging
        WHERE version_id = ${body.versionId}::uuid
      `;

      // 4. Check for still-unmapped accounts
      const stillUnmapped = new Set<string>();
      for (const s of staging) {
        if (!resolve(s.account_name, s.company_id)) stillUnmapped.add(s.account_name);
      }
      if (stillUnmapped.size > 0) {
        throw new Error(`Cuentas aún sin mapear: ${[...stillUnmapped].join(", ")}`);
      }

      // 5. Get version info (version_id, company_id, year) to build versionMap
      const versionInfo = await tx<{ id: string; company_id: string; year: number }[]>`
        SELECT id, company_id, year
        FROM finanzas.budget_versions
        WHERE id = ${body.versionId}::uuid
      `;
      const versionMap = new Map(versionInfo.map((v) => [`${v.company_id}:${v.year}`, v.id]));

      // 6. Aggregate staging → budget_monthly
      const agg = new Map<string, { versionId: string; companyId: string; pnlLineId: string; periodMonth: string; amount: number }>();
      for (const s of staging) {
        const pnlLineId = resolve(s.account_name, s.company_id)!;
        const year      = s.period_month.slice(0, 4);
        const vid       = versionMap.get(`${s.company_id}:${Number(year)}`) ?? body.versionId;
        const key       = `${vid}|${s.company_id}|${pnlLineId}|${s.period_month}`;
        const existing  = agg.get(key);
        if (existing) {
          existing.amount += Number(s.amount);
        } else {
          agg.set(key, { versionId: vid, companyId: s.company_id, pnlLineId, periodMonth: s.period_month, amount: Number(s.amount) });
        }
      }

      const values = Array.from(agg.values()).map((v) => ({
        version_id:   v.versionId,
        company_id:   v.companyId,
        pnl_line_id:  v.pnlLineId,
        period_month: v.periodMonth,
        amount:       v.amount,
      }));

      const BATCH = 500;
      for (let i = 0; i < values.length; i += BATCH) {
        const batch = values.slice(i, i + BATCH);
        await tx`
          INSERT INTO finanzas.budget_monthly
            ${tx(batch, ["version_id", "company_id", "pnl_line_id", "period_month", "amount"])}
          ON CONFLICT (version_id, company_id, pnl_line_id, period_month)
          DO UPDATE SET amount = EXCLUDED.amount
        `;
      }

      return { committed: values.length };
    });

    void triggerDbtRun();
    return NextResponse.json({ success: true, committed: result.committed });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}
