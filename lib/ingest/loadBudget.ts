import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { parseBudgetBuffer } from "./parseBudget";

export type LoadBudgetResult =
  | {
      success: true;
      versionIds: string[];
      rowCount: number;
      companiesLoaded: string[];
      warnings: string[];
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
      error: `Empresas no encontradas en la base de datos: ${unknownCompanies.join(", ")}`,
    };
  }

  // ── 3. Resolve pnl_lines ─────────────────────────────────────────────────

  const lineCodes = [...new Set(parsed.rows.map((r) => r.pnlLineCode))];
  const pnlLines = await sql<{ id: string; code: string; label: string }[]>`
    SELECT id, code, label FROM finanzas.pnl_lines
    WHERE LOWER(code) = ANY(${lineCodes.map((c) => c.toLowerCase())})
       OR LOWER(label) = ANY(${lineCodes.map((c) => c.toLowerCase())})
  `;
  // Prefer code match over label match
  const lineMap = new Map<string, string>();
  for (const pl of pnlLines) {
    lineMap.set(pl.code.toLowerCase(),  pl.id);
    lineMap.set(pl.label.toLowerCase(), pl.id);
  }
  // Code match overrides label match
  for (const pl of pnlLines) {
    lineMap.set(pl.code.toLowerCase(), pl.id);
  }

  const unknownLines = lineCodes.filter((c) => !lineMap.has(c.toLowerCase()));
  if (unknownLines.length > 0) {
    return {
      success: false,
      error: `Líneas PnL no encontradas: ${unknownLines.join(", ")}. Usar código (ej. INGRESOS) o etiqueta exacta.`,
    };
  }

  // ── 4. Group by company + year → one budget_version each ─────────────────

  // Determine the year range per company from the rows
  const companyYears = new Map<string, Set<number>>();
  for (const row of parsed.rows) {
    const companyId = companyMap.get(row.companyName.toLowerCase())!;
    const year      = parseInt(row.periodMonth.slice(0, 4), 10);
    if (!companyYears.has(companyId)) companyYears.set(companyId, new Set());
    companyYears.get(companyId)!.add(year);
  }

  const versionIds: string[] = [];

  try {
    const txResult = await sql.begin(async (sql) => {
      const createdVersions: { id: string; companyId: string; year: number }[] = [];

      for (const [companyId, years] of companyYears) {
        for (const year of years) {
          // Deactivate previous active versions for same company+year
          await sql`
            UPDATE finanzas.budget_versions
            SET is_active = FALSE
            WHERE company_id = ${companyId}::uuid
              AND year = ${year}
              AND is_active = TRUE
          `;

          // Create new version
          const versionName = `${filename} — ${new Date().toISOString().slice(0, 10)}`;
          const [vRow] = await sql<{ id: string }[]>`
            INSERT INTO finanzas.budget_versions (company_id, name, year, created_by)
            VALUES (${companyId}::uuid, ${versionName}, ${year}, ${params.uploadedBy ?? null})
            RETURNING id
          `;
          createdVersions.push({ id: vRow.id, companyId, year });
        }
      }

      // Build a map: companyId+year → versionId
      const versionMap = new Map(
        createdVersions.map((v) => [`${v.companyId}:${v.year}`, v.id])
      );

      // Insert budget_monthly rows
      const values = parsed.rows.map((row) => {
        const companyId   = companyMap.get(row.companyName.toLowerCase())!;
        const pnlLineId   = lineMap.get(row.pnlLineCode.toLowerCase())!;
        const year        = parseInt(row.periodMonth.slice(0, 4), 10);
        const versionId   = versionMap.get(`${companyId}:${year}`)!;
        return {
          version_id:   versionId,
          company_id:   companyId,
          pnl_line_id:  pnlLineId,
          period_month: row.periodMonth,
          amount:       row.amount,
        };
      });

      const BATCH = 500;
      for (let i = 0; i < values.length; i += BATCH) {
        const batch = values.slice(i, i + BATCH);
        await sql`
          INSERT INTO finanzas.budget_monthly
            ${sql(batch, ["version_id", "company_id", "pnl_line_id", "period_month", "amount"])}
          ON CONFLICT (version_id, company_id, pnl_line_id, period_month)
          DO UPDATE SET amount = EXCLUDED.amount
        `;
      }

      return createdVersions.map((v) => v.id);
    });

    versionIds.push(...txResult);
  } catch (err) {
    return { success: false, error: `Error al guardar presupuesto: ${(err as Error).message}` };
  }

  await logAudit({
    userId: params.uploadedBy ?? null,
    action: "upload_budget",
    entityType: "budget_version",
    metadata: {
      filename,
      row_count: parsed.rows.length,
      version_ids: versionIds,
      companies: companyNames,
    },
  });

  return {
    success: true,
    versionIds,
    rowCount: parsed.rows.length,
    companiesLoaded: companyNames,
    warnings,
  };
}
