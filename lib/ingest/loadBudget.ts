import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { parseBudgetBuffer } from "./parseBudget";

export type LoadBudgetResult =
  | {
      success: true;
      status: "committed";
      versionIds: string[];
      rowCount: number;
      companiesLoaded: string[];
      warnings: string[];
    }
  | {
      success: true;
      status: "pending_mapping";
      versionIds: string[];
      rowCount: number;
      companiesLoaded: string[];
      warnings: string[];
      unmapped: string[];  // account names without a mapping
    }
  | { success: false; error: string };

export async function loadBudgetFile(params: {
  buffer: Buffer;
  filename: string;
  uploadedBy?: string;
}): Promise<LoadBudgetResult> {
  const { buffer, filename } = params;

  // ── 1. Parse ──────────────────────────────────────────────────────────────

  let parsed;
  try {
    parsed = parseBudgetBuffer(buffer, filename);
  } catch (err) {
    return { success: false, error: `Error al leer el archivo: ${(err as Error).message}` };
  }

  if (parsed.rows.length === 0) {
    return {
      success: false,
      error:
        parsed.errors.length > 0
          ? `El archivo no tiene filas válidas. Errores: ${parsed.errors.slice(0, 3).map((e) => `fila ${e.row}: ${e.message}`).join("; ")}`
          : "El archivo no contiene filas válidas.",
    };
  }

  const warnings: string[] = parsed.errors.map((e) => `Fila ${e.row}: ${e.message}`);

  // ── 2. Resolve companies ──────────────────────────────────────────────────

  const companyNames = [...new Set(parsed.rows.map((r) => r.companyName))];
  const companies = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM finanzas.companies
    WHERE is_active = TRUE AND LOWER(name) = ANY(${companyNames.map((n) => n.toLowerCase())})
  `;
  const companyMap = new Map(companies.map((c) => [c.name.toLowerCase(), c.id]));

  const unknownCompanies = companyNames.filter((n) => !companyMap.has(n.toLowerCase()));
  if (unknownCompanies.length > 0) {
    return {
      success: false,
      error: `Empresas no encontradas: ${unknownCompanies.join(", ")}`,
    };
  }

  // ── 3. Fetch existing budget_account_mappings ─────────────────────────────

  const accountNames = [...new Set(parsed.rows.map((r) => r.accountName))];
  const companyIds   = [...new Set(Object.values(Object.fromEntries(companyMap)))];

  const mappingRows = await sql<{ account_name: string; company_id: string | null; pnl_line_code: string }[]>`
    SELECT account_name, company_id, pnl_line_code
    FROM finanzas.budget_account_mappings
    WHERE is_active = TRUE
      AND LOWER(account_name) = ANY(${accountNames.map((n) => n.toLowerCase())})
      AND (company_id IS NULL OR company_id = ANY(${companyIds}::uuid[]))
  `;

  // Build mapping: (accountNameLower, companyId) → pnlLineCode
  // Company-specific mapping takes priority over global (company_id IS NULL)
  const mappingKey = (name: string, cid: string | null) => `${name.toLowerCase()}|${cid ?? "__global__"}`;
  const resolvedMap = new Map<string, string>();
  for (const m of mappingRows) {
    if (m.company_id === null) resolvedMap.set(mappingKey(m.account_name, null), m.pnl_line_code);
  }
  for (const m of mappingRows) {
    if (m.company_id !== null) resolvedMap.set(mappingKey(m.account_name, m.company_id), m.pnl_line_code);
  }

  function resolveMapping(accountName: string, companyId: string): string | null {
    return (
      resolvedMap.get(mappingKey(accountName, companyId)) ??
      resolvedMap.get(mappingKey(accountName, null)) ??
      null
    );
  }

  // ── 4. Group by company + year → create budget_versions ──────────────────

  const companyYears = new Map<string, Set<number>>();
  for (const row of parsed.rows) {
    const companyId = companyMap.get(row.companyName.toLowerCase())!;
    const year      = parseInt(row.periodMonth.slice(0, 4), 10);
    if (!companyYears.has(companyId)) companyYears.set(companyId, new Set());
    companyYears.get(companyId)!.add(year);
  }

  const versionIds: string[] = [];

  try {
    const txResult = await sql.begin(async (tx) => {
      const createdVersions: { id: string; companyId: string; year: number }[] = [];

      for (const [companyId, years] of companyYears) {
        for (const year of years) {
          await tx`
            UPDATE finanzas.budget_versions
            SET is_active = FALSE
            WHERE company_id = ${companyId}::uuid
              AND year = ${year}
              AND is_active = TRUE
          `;
          const versionName = `${filename} — ${new Date().toISOString().slice(0, 10)}`;
          const [vRow] = await tx<{ id: string }[]>`
            INSERT INTO finanzas.budget_versions (company_id, name, year, created_by)
            VALUES (${companyId}::uuid, ${versionName}, ${year}, ${params.uploadedBy ?? null})
            RETURNING id
          `;
          createdVersions.push({ id: vRow.id, companyId, year });
        }
      }

      const versionMap = new Map(
        createdVersions.map((v) => [`${v.companyId}:${v.year}`, v.id])
      );

      // Insert all rows into budget_staging
      const stagingValues = parsed.rows.map((row) => {
        const companyId  = companyMap.get(row.companyName.toLowerCase())!;
        const year       = parseInt(row.periodMonth.slice(0, 4), 10);
        const versionId  = versionMap.get(`${companyId}:${year}`)!;
        return {
          version_id:   versionId,
          company_id:   companyId,
          account_name: row.accountName,
          period_month: row.periodMonth,
          amount:       row.amount,
          source_row:   row.sourceRow,
        };
      });

      const BATCH = 500;
      for (let i = 0; i < stagingValues.length; i += BATCH) {
        const batch = stagingValues.slice(i, i + BATCH);
        await tx`
          INSERT INTO finanzas.budget_staging
            ${tx(batch, ["version_id", "company_id", "account_name", "period_month", "amount", "source_row"])}
        `;
      }

      // Identify unmapped accounts
      const unmappedSet = new Set<string>();
      for (const row of parsed.rows) {
        const companyId = companyMap.get(row.companyName.toLowerCase())!;
        if (!resolveMapping(row.accountName, companyId)) {
          unmappedSet.add(row.accountName);
        }
      }

      // If all mapped, commit to budget_monthly immediately
      if (unmappedSet.size === 0) {
        const values = buildBudgetMonthlyValues(parsed.rows, companyMap, versionMap, resolveMapping);
        const BATCH2 = 500;
        for (let i = 0; i < values.length; i += BATCH2) {
          const batch = values.slice(i, i + BATCH2);
          await tx`
            INSERT INTO finanzas.budget_monthly
              ${tx(batch, ["version_id", "company_id", "pnl_line_code", "period_month", "amount"])}
            ON CONFLICT (version_id, company_id, pnl_line_code, period_month)
            DO UPDATE SET amount = EXCLUDED.amount
          `;
        }
      }

      return { versionIds: createdVersions.map((v) => v.id), unmapped: [...unmappedSet] };
    });

    versionIds.push(...txResult.versionIds);

    await logAudit({
      userId: params.uploadedBy ?? null,
      action: "upload_budget",
      entityType: "budget_version",
      metadata: {
        filename,
        row_count: parsed.rows.length,
        version_ids: versionIds,
        companies: companyNames,
        unmapped_count: txResult.unmapped.length,
      },
    });

    if (txResult.unmapped.length > 0) {
      return {
        success: true,
        status: "pending_mapping",
        versionIds,
        rowCount: parsed.rows.length,
        companiesLoaded: companyNames,
        warnings,
        unmapped: txResult.unmapped,
      };
    }

    return {
      success: true,
      status: "committed",
      versionIds,
      rowCount: parsed.rows.length,
      companiesLoaded: companyNames,
      warnings,
    };
  } catch (err) {
    return { success: false, error: `Error al guardar presupuesto: ${(err as Error).message}` };
  }
}

// Pure aggregation helper — no SQL, usable inside or outside a transaction.
export function buildBudgetMonthlyValues(
  rows: Array<{ companyName?: string; accountName: string; periodMonth: string; amount: number; company_id?: string }>,
  companyMap: Map<string, string>,
  versionMap: Map<string, string>,
  resolveMapping: (accountName: string, companyId: string) => string | null
): Array<{ version_id: string; company_id: string; pnl_line_code: string; period_month: string; amount: number }> {
  const agg = new Map<string, { version_id: string; company_id: string; pnl_line_code: string; period_month: string; amount: number }>();

  for (const row of rows) {
    const companyId = row.company_id ?? companyMap.get(row.companyName!.toLowerCase());
    if (!companyId) continue;
    const pnlLineCode = resolveMapping(row.accountName, companyId);
    if (!pnlLineCode) continue;
    const year      = parseInt(row.periodMonth.slice(0, 4), 10);
    const versionId = versionMap.get(`${companyId}:${year}`);
    if (!versionId) continue;
    const key       = `${versionId}|${companyId}|${pnlLineCode}|${row.periodMonth}`;
    const existing  = agg.get(key);
    if (existing) {
      existing.amount += row.amount;
    } else {
      agg.set(key, { version_id: versionId, company_id: companyId, pnl_line_code: pnlLineCode, period_month: row.periodMonth, amount: row.amount });
    }
  }

  return Array.from(agg.values());
}
