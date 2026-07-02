-- Migration 034: migrate budget_monthly and budget_account_mappings
-- from pnl_line_id UUID (FK to legacy pnl_lines) to pnl_line_code TEXT.
-- Also updates v_scenario_monthly and fn_dashboard_kpis which referenced pnl_line_id.
SET search_path TO finanzas;

BEGIN;

-- ── 1. Add pnl_line_code columns (nullable first for backfill) ────────────────

ALTER TABLE budget_monthly
  ADD COLUMN IF NOT EXISTS pnl_line_code TEXT;

ALTER TABLE budget_account_mappings
  ADD COLUMN IF NOT EXISTS pnl_line_code TEXT;

-- ── 2. Backfill from pnl_lines ────────────────────────────────────────────────

UPDATE budget_monthly bm
SET pnl_line_code = pl.code
FROM pnl_lines pl
WHERE pl.id = bm.pnl_line_id
  AND bm.pnl_line_code IS NULL;

UPDATE budget_account_mappings bam
SET pnl_line_code = pl.code
FROM pnl_lines pl
WHERE pl.id = bam.pnl_line_id
  AND bam.pnl_line_code IS NULL;

-- ── 3. Set NOT NULL ───────────────────────────────────────────────────────────

ALTER TABLE budget_monthly
  ALTER COLUMN pnl_line_code SET NOT NULL;

ALTER TABLE budget_account_mappings
  ALTER COLUMN pnl_line_code SET NOT NULL;

-- ── 4. Recreate v_scenario_monthly without pnl_line_id ───────────────────────
-- (the view references bm.pnl_line_id so it must be dropped before the column)

DROP VIEW IF EXISTS v_scenario_monthly CASCADE;

CREATE OR REPLACE VIEW v_scenario_monthly AS
SELECT
  m.company_id,
  m.pnl_line_code,
  m.period_month,
  'actual'::TEXT AS scenario,
  m.amount
FROM v_pnl_base_monthly m
UNION ALL
SELECT
  bm.company_id,
  bm.pnl_line_code,
  bm.period_month,
  'budget'::TEXT,
  bm.amount
FROM budget_monthly bm
JOIN budget_versions bv ON bm.version_id = bv.id AND bv.is_active = TRUE
UNION ALL
SELECT
  fm.company_id,
  pl.code         AS pnl_line_code,
  fm.period_month,
  'forecast'::TEXT,
  fm.amount
FROM forecast_monthly fm
JOIN forecast_versions fv ON fm.version_id = fv.id AND fv.is_active = TRUE
JOIN pnl_lines pl ON pl.id = fm.pnl_line_id;

-- ── 5. Recreate fn_dashboard_kpis without JOIN to pnl_lines on budget ─────────

CREATE OR REPLACE FUNCTION fn_dashboard_kpis(
  p_period_month  DATE,
  p_company_ids   UUID[] DEFAULT NULL
)
RETURNS TABLE (
  metric_code   TEXT,
  metric_label  TEXT,
  metric_value  NUMERIC,
  metric_format TEXT
)
LANGUAGE SQL STABLE
SET search_path = finanzas
AS $$

  WITH
  pnl AS (
    SELECT line_code, SUM(amount) AS amount
    FROM fn_pnl_ytd(p_period_month, p_company_ids)
    GROUP BY line_code
  ),
  pnl_py AS (
    SELECT line_code, SUM(amount) AS amount
    FROM fn_pnl_ytd((p_period_month - INTERVAL '1 year')::DATE, p_company_ids)
    GROUP BY line_code
  ),
  budget_ytd AS (
    SELECT bm.pnl_line_code AS line_code, SUM(bm.amount) AS amount
    FROM budget_monthly bm
    JOIN budget_versions bv
      ON bm.version_id = bv.id AND bv.is_active = TRUE
    WHERE bm.period_month >= date_trunc('year', p_period_month)::DATE
      AND bm.period_month <= p_period_month
      AND (p_company_ids IS NULL OR bm.company_id = ANY(p_company_ids))
    GROUP BY bm.pnl_line_code
  ),

  rev     AS (SELECT amount             AS v FROM pnl        WHERE line_code = 'INGRESOS'),
  ebitda  AS (SELECT amount             AS v FROM pnl        WHERE line_code = 'EBITDA'),
  res     AS (SELECT amount             AS v FROM pnl        WHERE line_code = 'RESULTADO_FINAL'),
  rrhh    AS (SELECT amount             AS v FROM pnl        WHERE line_code = 'RRHH'),
  mkt     AS (SELECT amount             AS v FROM pnl        WHERE line_code = 'MARKETING'),
  rev_den AS (SELECT NULLIF(amount, 0)  AS v FROM pnl        WHERE line_code = 'INGRESOS'),
  rev_py  AS (SELECT NULLIF(amount, 0)  AS v FROM pnl_py     WHERE line_code = 'INGRESOS'),
  ebt_py  AS (SELECT NULLIF(amount, 0)  AS v FROM pnl_py     WHERE line_code = 'EBITDA'),
  rev_bud AS (SELECT NULLIF(amount, 0)  AS v FROM budget_ytd WHERE line_code = 'INGRESOS'),
  ebt_bud AS (SELECT NULLIF(amount, 0)  AS v FROM budget_ytd WHERE line_code = 'EBITDA'),
  res_bud AS (SELECT NULLIF(amount, 0)  AS v FROM budget_ytd WHERE line_code = 'RESULTADO_FINAL')

  SELECT 'REVENUE_YTD',            'Ingresos YTD',
    (SELECT amount FROM pnl WHERE line_code = 'INGRESOS'),                          'currency'
  UNION ALL
  SELECT 'EBITDA_YTD',             'EBITDA YTD',
    (SELECT amount FROM pnl WHERE line_code = 'EBITDA'),                            'currency'
  UNION ALL
  SELECT 'EBITDA_MARGIN',          'Margen EBITDA',
    (SELECT e.v / d.v FROM ebitda e, rev_den d),                                    'percentage'
  UNION ALL
  SELECT 'RESULTADO_FINAL',        'Resultado Final',
    (SELECT amount FROM pnl WHERE line_code = 'RESULTADO_FINAL'),                   'currency'
  UNION ALL
  SELECT 'RRHH_RATIO',             'RRHH / Ingresos',
    (SELECT h.v / d.v FROM rrhh h, rev_den d),                                      'percentage'
  UNION ALL
  SELECT 'MKT_RATIO',              'Marketing / Ingresos',
    (SELECT m.v / d.v FROM mkt m, rev_den d),                                       'percentage'
  UNION ALL
  SELECT 'REVENUE_VS_PRIOR_PCT',   'Ingresos vs Año Ant.',
    (SELECT (r.v - p.v) / ABS(p.v) FROM rev r, rev_py p),                          'percentage'
  UNION ALL
  SELECT 'EBITDA_VS_PRIOR_PCT',    'EBITDA vs Año Ant.',
    (SELECT (e.v - p.v) / ABS(p.v) FROM ebitda e, ebt_py p),                       'percentage'
  UNION ALL
  SELECT 'REVENUE_VS_BUDGET_PCT',  'Ingresos vs Presupuesto',
    (SELECT (r.v - b.v) / ABS(b.v) FROM rev r, rev_bud b),                         'percentage'
  UNION ALL
  SELECT 'EBITDA_VS_BUDGET_PCT',   'EBITDA vs Presupuesto',
    (SELECT (e.v - b.v) / ABS(b.v) FROM ebitda e, ebt_bud b),                      'percentage'
  UNION ALL
  SELECT 'EBITDA_BUDGET_ATTAIN',   'Cumpl. Presupuesto EBITDA',
    (SELECT e.v / b.v FROM ebitda e, ebt_bud b),                                    'percentage';

$$;

-- ── 6. Replace unique constraint on budget_monthly ────────────────────────────

DO $$
DECLARE
  c_name TEXT;
BEGIN
  SELECT constraint_name INTO c_name
  FROM information_schema.table_constraints
  WHERE table_schema = 'finanzas'
    AND table_name = 'budget_monthly'
    AND constraint_type = 'UNIQUE'
    AND constraint_name LIKE '%pnl_line_id%';
  IF c_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE finanzas.budget_monthly DROP CONSTRAINT ' || quote_ident(c_name);
  END IF;
END $$;

ALTER TABLE budget_monthly
  ADD CONSTRAINT budget_monthly_version_company_line_period_key
  UNIQUE (version_id, company_id, pnl_line_code, period_month);

-- ── 7. Drop legacy pnl_line_id columns ───────────────────────────────────────
-- CASCADE handles any remaining dependent views not explicitly dropped above.

ALTER TABLE budget_monthly
  DROP COLUMN IF EXISTS pnl_line_id CASCADE;

ALTER TABLE budget_account_mappings
  DROP COLUMN IF EXISTS pnl_line_id CASCADE;

COMMIT;
