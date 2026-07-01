SET search_path TO finanzas;

-- ─── v_pnl_movements ─────────────────────────────────────────────────────────
-- Every journal entry that is P&L, joined to its PnL line (if mapped).

-- LATERAL subquery picks the best mapping per journal entry:
-- company-specific (company_id = je.company_id) beats global (company_id IS NULL).
CREATE OR REPLACE VIEW v_pnl_movements AS
SELECT
  je.id                                         AS journal_entry_id,
  je.company_id,
  c.name                                        AS company_name,
  je.uploaded_file_id,
  je.entry_date,
  je.period_month,
  je.account_code,
  je.account_name,
  je.description,
  je.document_number,
  je.cost_center,
  je.debit,
  je.credit,
  je.amount * COALESCE(best.sign_multiplier, 1) AS pnl_amount,
  je.currency,
  best.pnl_line_id,
  pl.code                                       AS pnl_line_code,
  pl.label                                      AS pnl_line_label,
  pl.parent_code,
  pl.level,
  pl.sort_order
FROM journal_entries je
JOIN companies c
  ON c.id = je.company_id
LEFT JOIN LATERAL (
  SELECT apm.pnl_line_id, apm.sign_multiplier
  FROM account_pnl_mappings apm
  WHERE apm.is_active = TRUE
    AND apm.account_code = je.account_code
    AND (apm.company_id = je.company_id OR apm.company_id IS NULL)
  ORDER BY CASE WHEN apm.company_id IS NOT NULL THEN 1 ELSE 2 END
  LIMIT 1
) best ON TRUE
LEFT JOIN pnl_lines pl
  ON pl.id = best.pnl_line_id
WHERE je.is_pnl = TRUE;

-- ─── v_unmapped_pnl_accounts ─────────────────────────────────────────────────
-- P&L accounts that have no entry in account_pnl_mappings.
-- Used by admin/mappings to surface accounts that need to be assigned.

CREATE OR REPLACE VIEW v_unmapped_pnl_accounts AS
SELECT
  je.company_id,
  c.name                 AS company_name,
  je.account_code,
  MAX(je.account_name)   AS account_name,
  COUNT(*)               AS movement_count,
  SUM(je.amount)         AS total_amount,
  MIN(je.entry_date)     AS first_entry_date,
  MAX(je.entry_date)     AS last_entry_date
FROM journal_entries je
JOIN companies c
  ON c.id = je.company_id
LEFT JOIN account_pnl_mappings apm
  ON apm.is_active = TRUE
  AND apm.account_code = je.account_code
  AND (apm.company_id = je.company_id OR apm.company_id IS NULL)
WHERE je.is_pnl = TRUE
  AND apm.id IS NULL
GROUP BY je.company_id, c.name, je.account_code
ORDER BY c.name, je.account_code;

-- ─── v_pnl_base_monthly ──────────────────────────────────────────────────────
-- Monthly aggregation of PnL amounts, grouped by company × period × line.
-- Only includes lines that are mapped (non-null pnl_line_code).

CREATE OR REPLACE VIEW v_pnl_base_monthly AS
SELECT
  company_id,
  company_name,
  period_month,
  pnl_line_id,
  pnl_line_code,
  pnl_line_label,
  parent_code,
  SUM(pnl_amount) AS amount
FROM v_pnl_movements
WHERE pnl_line_code IS NOT NULL
GROUP BY
  company_id,
  company_name,
  period_month,
  pnl_line_id,
  pnl_line_code,
  pnl_line_label,
  parent_code;
