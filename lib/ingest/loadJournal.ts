import { createHash } from "crypto";
import { sql } from "@/lib/db";
import { parseJournalBuffer, ParsedRow } from "./parseJournal";

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
}): Promise<LoadJournalResult> {
  const { buffer, filename, companyId } = params;

  // Verify company exists
  const companies = await sql`
    SELECT id, name FROM finanzas.companies WHERE id = ${companyId} AND is_active = TRUE
  `;
  if (!companies.length) {
    return { success: false, error: "Empresa no encontrada o inactiva." };
  }
  const companyName = companies[0].name as string;

  // Calculate file hash to detect duplicates
  const fileHash = createHash("sha256").update(buffer).digest("hex");

  const existingFile = await sql`
    SELECT id FROM finanzas.uploaded_files
    WHERE company_id = ${companyId} AND file_hash = ${fileHash}
    LIMIT 1
  `;
  if (existingFile.length) {
    return { success: false, error: "Este archivo ya fue cargado anteriormente." };
  }

  // Parse the Excel file
  let rows: ParsedRow[];
  try {
    rows = parseJournalBuffer(buffer, filename);
  } catch (err) {
    return { success: false, error: `Error al leer el archivo: ${(err as Error).message}` };
  }

  if (!rows.length) {
    return { success: false, error: "El archivo no contiene filas válidas." };
  }

  // Infer period_month from data if not provided
  const inferredPeriod = params.periodMonth
    ?? rows[0].periodMonth.toISOString().slice(0, 10);

  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const pnlRowCount = rows.filter((r) => r.isPnl).length;

  // Insert uploaded_files record (status = processing)
  const fileRows = await sql`
    INSERT INTO finanzas.uploaded_files
      (company_id, original_filename, file_hash, period_month, status,
       row_count, total_debit, total_credit)
    VALUES
      (${companyId}, ${filename}, ${fileHash}, ${inferredPeriod},
       'processing', ${rows.length}, ${totalDebit}, ${totalCredit})
    RETURNING id
  `;
  const uploadedFileId = fileRows[0].id as string;

  try {
    // Batch-insert journal_entries
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values = batch.map((r) => ({
        company_id:       companyId,
        uploaded_file_id: uploadedFileId,
        entry_date:       r.entryDate.toISOString().slice(0, 10),
        period_month:     r.periodMonth.toISOString().slice(0, 10),
        account_code:     r.accountCode,
        account_name:     r.accountName,
        description:      r.description,
        document_number:  r.documentNumber,
        debit:            r.debit,
        credit:           r.credit,
        amount:           r.amount,
        currency:         "CLP",
        is_pnl:           r.isPnl,
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

    // Mark as processed
    await sql`
      UPDATE finanzas.uploaded_files
      SET status = 'processed'
      WHERE id = ${uploadedFileId}
    `;

    // Fetch unmapped accounts for this upload
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
    };
  } catch (err) {
    // Mark as failed and surface error
    await sql`
      UPDATE finanzas.uploaded_files
      SET status = 'failed', error_message = ${(err as Error).message}
      WHERE id = ${uploadedFileId}
    `;
    return {
      success: false,
      error: `Error al insertar movimientos: ${(err as Error).message}`,
    };
  }
}
