-- Migration: existing finanzas.* tables → new portal tables
-- Run ONCE after 001–003 have been applied.
-- Safe to run multiple times (uses INSERT ... ON CONFLICT DO NOTHING).

SET search_path TO finanzas;

-- ─── 1. Populate companies from distinct empresa values in fact_libro_diario ──
-- Maps empresa names from existing data to the seeded companies table.
-- Adjust the CASE if empresa values differ from company names.

INSERT INTO companies (name, country, base_currency)
SELECT DISTINCT
  TRIM(empresa),
  CASE
    WHEN TRIM(empresa) ILIKE '%bogot%' THEN 'Colombia'
    ELSE 'Chile'
  END,
  CASE
    WHEN TRIM(empresa) ILIKE '%bogot%' THEN 'COP'
    ELSE 'CLP'
  END
FROM fact_libro_diario
WHERE empresa IS NOT NULL AND TRIM(empresa) <> ''
ON CONFLICT (name) DO NOTHING;

-- ─── 2. Create a placeholder uploaded_file for migrated data ─────────────────

INSERT INTO uploaded_files
  (company_id, original_filename, file_hash, period_month, status, row_count)
SELECT
  c.id,
  'migration_from_fact_libro_diario.sql',
  md5('migration_' || c.name),
  NULL,
  'processed',
  COUNT(f.id)
FROM companies c
JOIN fact_libro_diario f
  ON TRIM(f.empresa) = c.name
GROUP BY c.id, c.name
ON CONFLICT (company_id, file_hash) DO NOTHING;

-- ─── 3. Populate journal_entries from fact_libro_diario ──────────────────────

INSERT INTO journal_entries
  (company_id, uploaded_file_id, entry_date, period_month,
   account_code, account_name, description,
   debit, credit, amount, currency, is_pnl)
SELECT
  c.id                                          AS company_id,
  uf.id                                         AS uploaded_file_id,
  COALESCE(f.fecha::DATE, f.periodo::DATE)      AS entry_date,
  f.periodo::DATE                               AS period_month,
  TRIM(CAST(f.cuenta_codigo AS TEXT))           AS account_code,
  TRIM(f.cuenta_nombre)                         AS account_name,
  TRIM(f.glosa)                                 AS description,
  COALESCE(f.debe_ml,  0)                       AS debit,
  COALESCE(f.haber_ml, 0)                       AS credit,
  COALESCE(f.saldo_ml, 0)                       AS amount,   -- saldo_ml = haber - debe
  'CLP'                                         AS currency,
  LEFT(TRIM(CAST(f.cuenta_codigo AS TEXT)), 1) IN ('4','5','6') AS is_pnl
FROM fact_libro_diario f
JOIN companies c
  ON TRIM(f.empresa) = c.name
JOIN uploaded_files uf
  ON uf.company_id = c.id
  AND uf.original_filename = 'migration_from_fact_libro_diario.sql'
WHERE f.cuenta_codigo IS NOT NULL;

-- ─── 4. Populate account_pnl_mappings from dim_pnl_mapping_rule (exact rules) ─
-- Only migrates exact-type rules (not prefix/fallback).
-- Maps nivel1 → pnl_lines.code using the known hierarchy.

INSERT INTO account_pnl_mappings
  (account_code, account_name, pnl_line_id, sign_multiplier, is_active, company_id)
SELECT DISTINCT
  r.pattern                                     AS account_code,
  NULL                                          AS account_name,
  pl.id                                         AS pnl_line_id,
  1                                             AS sign_multiplier,
  TRUE                                          AS is_active,
  NULL                                          AS company_id    -- applies to all companies
FROM dim_pnl_mapping_rule r
JOIN pnl_lines pl
  ON pl.code = CASE r.nivel1
    WHEN 'Ingresos'               THEN 'INGRESOS_DETALLE'
    WHEN 'Gastos Variables'       THEN 'COMISIONES_FREE_LANCE'  -- generic; refine via admin UI
    WHEN 'RRHH'                   THEN 'REMUNERACIONES'
    WHEN 'Marketing'              THEN 'GASTOS_MARKETING'
    WHEN 'Tecnología'             THEN 'SERVICIOS_IT'
    WHEN 'Gastos Oficina/Ocupación' THEN 'ARRIENDOS'
    WHEN 'Asesorías'              THEN 'OTRAS_ASESORIAS'
    WHEN 'No Operacionales'       THEN 'OTROS_GASTOS_EXPLOTACION'
    ELSE NULL
  END
WHERE r.rule_type = 'exact'
  AND r.activa = TRUE
  AND pl.id IS NOT NULL
ON CONFLICT (company_id, account_code) DO NOTHING;

-- ─── 5. Verification queries (run manually to check) ─────────────────────────

-- SELECT COUNT(*) FROM journal_entries;              -- should match fact_libro_diario
-- SELECT COUNT(*) FROM account_pnl_mappings;         -- exact-rule mappings
-- SELECT * FROM v_unmapped_pnl_accounts LIMIT 20;   -- accounts needing manual mapping
-- SELECT * FROM fn_pnl_ytd('2025-12-31', NULL) LIMIT 10;
