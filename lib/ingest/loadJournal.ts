import { createHash } from "crypto";
import { sql } from "@/lib/db";
import { parseJournalBuffer, ParsedRow } from "./parseJournal";
import { logAudit } from "@/lib/audit";

export type LoadJournalResult = {
  success: true;
  uploadedFileId: string;
  companyName: string;
  periodMonth: string | null;
  rowCount: number;
  totalDebit: number;
  totalCredit: number;
  pnlRowCount: number;
  unmappedAccounts: UnmappedAccount[];
  warnings: string[];
  supersededCount: number;
} | {
  success: false;
  error: string;
};

export type UnmappedAccount = {
  accountCode: string;
  accountName: string | null;
  movementCount: number;
  totalAmount: number;
};

const BATCH_SIZE = 500;

export async function loadJournalFile(params: {
  buffer: Buffer;
  filename: string;
  companyId: string;
  periodMonth?: string; // "YYYY-MM-01" — optional override
  uploadedBy?: string;  // user id for audit trail
}): Promise<LoadJournalResult> {
  const { buffer, filename, companyId } = params;

  // ── 1. Upfront checks (outside transaction) ──────────────────────────────

  const companies = await sql`
    SELECT id, name FROM finanzas.companies WHERE id = ${companyId} AND is_active = TRUE
  `;
  if (!companies.length) {
    return { success: false, error: "Empresa no encontrada o inactiva." };
  }
  const companyName = companies[0].name as string;

  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const existingFile = await sql`
    SELECT id FROM finanzas.uploaded_files
    WHERE company_id = ${companyId} AND file_hash = ${fileHash}
    LIMIT 1
  `;
  if (existingFile.length) {
    return { success: false, error: "Este archivo ya fue cargado anteriormente." };
  }

  // ── 2. Parse (outside transaction) ───────────────────────────────────────

  let rows: ParsedRow[];
  try {
    rows = parseJournalBuffer(buffer, filename);
  } catch (err) {
    return { success: false, error: `Error al leer el archivo: ${(err as Error).message}` };
  }
  if (!rows.length) {
    return { success: false, error: "El archivo no contiene filas válidas." };
  }

  const inferredPeriod = params.periodMonth ?? rows[0].periodMonth.toISOString().slice(0, 10);

  // ── 3. Period validation warning (P0-4) ──────────────────────────────────

  const warnings: string[] = [];
  if (params.periodMonth) {
    const expectedYearMonth = params.periodMonth.slice(0, 7);
    const mismatch = rows.filter(
      (r) => r.periodMonth.toISOString().slice(0, 7) !== expectedYearMonth
    );
    if (mismatch.length > 0) {
      warnings.push(
        `${mismatch.length} movimiento(s) tienen fecha fuera del período declarado (${expectedYearMonth}). Sus period_month fueron ajustados al período de la carga.`
      );
    }
  }

  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const pnlRowCount = rows.filter((r) => r.isPnl).length;

  // ── 4. All DB writes inside a single transaction (P0-2 + P0-3) ───────────

  let uploadedFileId: string;
  let supersededCount: number;

  try {
    const txResult = await sql.begin(async (sql) => {
      // Find previous processed uploads for same company + period → auto-replace
      const previous = await sql`
        SELECT id FROM finanzas.uploaded_files
        WHERE company_id = ${companyId}
          AND period_month = ${inferredPeriod}
          AND status = 'processed'
      `;
      const prevIds = previous.map((r) => r.id as string);

      // Delete their journal_entries before inserting new ones
      if (prevIds.length > 0) {
        await sql`
          DELETE FROM finanzas.journal_entries
          WHERE uploaded_file_id = ANY(${prevIds}::uuid[])
        `;
      }

      // Insert the new uploaded_files record
      const fileRows = await sql`
        INSERT INTO finanzas.uploaded_files
          (company_id, original_filename, file_hash, period_month, status,
           row_count, total_debit, total_credit, uploaded_by)
        VALUES
          (${companyId}, ${filename}, ${fileHash}, ${inferredPeriod},
           'processing', ${rows.length}, ${totalDebit}, ${totalCredit},
           ${params.uploadedBy ?? null})
        RETURNING id
      `;
      const newFileId = fileRows[0].id as string;

      // Mark previous uploads as 'replaced', pointing to the new file
      if (prevIds.length > 0) {
        await sql`
          UPDATE finanzas.uploaded_files
          SET status = 'replaced', superseded_by = ${newFileId}::uuid
          WHERE id = ANY(${prevIds}::uuid[])
        `;
      }

      // Batch-insert journal_entries; all entries use inferredPeriod when override is set
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const values = batch.map((r) => ({
          company_id:        companyId,
          uploaded_file_id:  newFileId,
          entry_date:        r.entryDate.toISOString().slice(0, 10),
          period_month:      params.periodMonth
            ? inferredPeriod
            : r.periodMonth.toISOString().slice(0, 10),
          account_code:      r.accountCode,
          account_name:      r.accountName,
          description:       r.description,
          document_number:   r.documentNumber,
          debit:             r.debit,
          credit:            r.credit,
          amount:            r.amount,
          currency:          "CLP",
          is_pnl:            r.isPnl,
          source_row_number: r.sourceRowNumber,
        }));

        await sql`
          INSERT INTO finanzas.journal_entries
            ${sql(values, [
              "company_id", "uploaded_file_id", "entry_date", "period_month",
              "account_code", "account_name", "description", "document_number",
              "debit", "credit", "amount", "currency", "is_pnl", "source_row_number",
            ])}
        `;
      }

      // Commit: mark as processed
      await sql`
        UPDATE finanzas.uploaded_files SET status = 'processed' WHERE id = ${newFileId}
      `;

      return { newFileId, supersededCount: prevIds.length };
    });

    uploadedFileId  = txResult.newFileId;
    supersededCount = txResult.supersededCount;
  } catch (err) {
    // Transaction rolled back cleanly — no orphaned data
    return {
      success: false,
      error: `Error al procesar el archivo: ${(err as Error).message}`,
    };
  }

  // ── 5. Audit log (outside tx so it persists even if tx retried) ─────────────

  await logAudit({
    userId: params.uploadedBy ?? null,
    action: "upload_file",
    entityType: "uploaded_file",
    entityId: uploadedFileId,
    metadata: {
      company_id: companyId,
      period_month: inferredPeriod,
      filename,
      row_count: rows.length,
      pnl_row_count: pnlRowCount,
      superseded_count: supersededCount,
    },
  });

  // ── 6. Fetch unmapped accounts (after commit) ─────────────────────────────

  const unmapped = await sql`
    SELECT
      je.account_code,
      MAX(je.account_name)  AS account_name,
      COUNT(*)::int         AS movement_count,
      SUM(je.amount)        AS total_amount
    FROM finanzas.journal_entries je
    LEFT JOIN finanzas.account_pnl_mappings apm
      ON apm.is_active = TRUE
      AND apm.account_code = je.account_code
      AND (apm.company_id = je.company_id OR apm.company_id IS NULL)
    WHERE je.uploaded_file_id = ${uploadedFileId}
      AND je.is_pnl = TRUE
      AND apm.id IS NULL
    GROUP BY je.account_code
    ORDER BY SUM(ABS(je.amount)) DESC
  `;

  return {
    success: true,
    uploadedFileId,
    companyName,
    periodMonth: inferredPeriod,
    rowCount: rows.length,
    totalDebit,
    totalCredit,
    pnlRowCount,
    unmappedAccounts: unmapped.map((r) => ({
      accountCode:   r.account_code as string,
      accountName:   r.account_name as string | null,
      movementCount: r.movement_count as number,
      totalAmount:   Number(r.total_amount),
    })),
    warnings,
    supersededCount,
  };
}
