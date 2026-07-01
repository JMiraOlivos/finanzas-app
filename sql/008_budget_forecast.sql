-- Migration 008: budget & forecast tables, scenario view, extended dashboard KPIs
-- Run with: npx tsx scripts/migrate.ts  (after adding '008_budget_forecast.sql' to MIGRATION_FILES)
-- Safe to run multiple times (IF NOT EXISTS / CREATE OR REPLACE).

SET search_path TO finanzas;

-- ─── budget_versions ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS budget_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  year        INT  NOT NULL,
  created_by  UUID REFERENCES app_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active   BOOL NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_budget_versions_co_year
  ON budget_versions(company_id, year);

-- ─── budget_monthly ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS budget_monthly (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id   UUID NOT NULL REFERENCES budget_versions(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id),
  pnl_line_id  UUID NOT NULL REFERENCES pnl_lines(id),
  period_month DATE NOT NULL,
  amount       NUMERIC(15,2) NOT NULL,
  UNIQUE (version_id, company_id, pnl_line_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_budget_monthly_co_period
  ON budget_monthly(company_id, period_month);

-- ─── forecast_versions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS forecast_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  year        INT  NOT NULL,
  created_by  UUID REFERENCES app_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active   BOOL NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_forecast_versions_co_year
  ON forecast_versions(company_id, year);

-- ─── forecast_monthly ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS forecast_monthly (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id   UUID NOT NULL REFERENCES forecast_versions(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id),
  pnl_line_id  UUID NOT NULL REFERENCES pnl_lines(id),
  period_month DATE NOT NULL,
  amount       NUMERIC(15,2) NOT NULL,
  UNIQUE (version_id, company_id, pnl_line_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_forecast_monthly_co_period
  ON forecast_monthly(company_id, period_month);

-- ─── v_scenario_monthly ──────────────────────────────────────────────────────
-- Unifies actual, budget and forecast for the same period/company/line.

CREATE OR REPLACE VIEW v_scenario_monthly AS
SELECT
  m.company_id,
  m.pnl_line_id,
  m.pnl_line_code,
  m.period_month,
  'actual'::TEXT AS scenario,
  m.amount
FROM v_pnl_base_monthly m
UNION ALL
SELECT
  bm.company_id,
  bm.pnl_line_id,
  pl.code         AS pnl_line_code,
  bm.period_month,
  'budget'::TEXT,
  bm.amount
FROM budget_monthly bm
JOIN budget_versions bv ON bm.version_id = bv.id AND bv.is_active = TRUE
JOIN pnl_lines pl ON pl.id = bm.pnl_line_id
UNION ALL
SELECT
  fm.company_id,
  fm.pnl_line_id,
  pl.code         AS pnl_line_code,
  fm.period_month,
  'forecast'::TEXT,
  fm.amount
FROM forecast_monthly fm
JOIN forecast_versions fv ON fm.version_id = fv.id AND fv.is_active = TRUE
JOIN pnl_lines pl ON pl.id = fm.pnl_line_id;

-- ─── fn_dashboard_kpis (extended) ────────────────────────────────────────────
-- Adds vs-prior-year and vs-budget comparison rows.
-- Returns NULL for comparison rows when no prior year data or budget exists.

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
  -- Current YTD
  pnl AS (
    SELECT line_code, SUM(amount) AS amount
    FROM fn_pnl_ytd(p_period_month, p_company_ids)
    GROUP BY line_code
  ),
  -- Prior year same YTD endpoint
  pnl_py AS (
    SELECT line_code, SUM(amount) AS amount
    FROM fn_pnl_ytd((p_period_month - INTERVAL '1 year')::DATE, p_company_ids)
    GROUP BY line_code
  ),
  -- Budget YTD: Jan 1 → p_period_month, active versions only
  budget_ytd AS (
    SELECT pl.code AS line_code, SUM(bm.amount) AS amount
    FROM budget_monthly bm
    JOIN budget_versions bv
      ON bm.version_id = bv.id AND bv.is_active = TRUE
    JOIN pnl_lines pl ON pl.id = bm.pnl_line_id
    WHERE bm.period_month >= date_trunc('year', p_period_month)::DATE
      AND bm.period_month <= p_period_month
      AND (p_company_ids IS NULL OR bm.company_id = ANY(p_company_ids))
    GROUP BY pl.code
  ),

  -- Key scalars (NULLIF protects denominators)
  rev     AS (SELECT amount                   AS v FROM pnl        WHERE line_code = 'INGRESOS'),
  ebitda  AS (SELECT amount                   AS v FROM pnl        WHERE line_code = 'EBITDA'),
  res     AS (SELECT amount                   AS v FROM pnl        WHERE line_code = 'RESULTADO_FINAL'),
  rrhh    AS (SELECT amount                   AS v FROM pnl        WHERE line_code = 'RRHH'),
  mkt     AS (SELECT amount                   AS v FROM pnl        WHERE line_code = 'MARKETING'),
  rev_den AS (SELECT NULLIF(amount, 0)        AS v FROM pnl        WHERE line_code = 'INGRESOS'),
  rev_py  AS (SELECT NULLIF(amount, 0)        AS v FROM pnl_py     WHERE line_code = 'INGRESOS'),
  ebt_py  AS (SELECT NULLIF(amount, 0)        AS v FROM pnl_py     WHERE line_code = 'EBITDA'),
  rev_bud AS (SELECT NULLIF(amount, 0)        AS v FROM budget_ytd WHERE line_code = 'INGRESOS'),
  ebt_bud AS (SELECT NULLIF(amount, 0)        AS v FROM budget_ytd WHERE line_code = 'EBITDA'),
  res_bud AS (SELECT NULLIF(amount, 0)        AS v FROM budget_ytd WHERE line_code = 'RESULTADO_FINAL')

  -- ── Base KPIs ───────────────────────────────────────────────────────────────
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

  -- ── vs Año Anterior ─────────────────────────────────────────────────────────
  UNION ALL
  SELECT 'REVENUE_VS_PRIOR_PCT',   'Ingresos vs Año Ant.',
    (SELECT (r.v - p.v) / ABS(p.v) FROM rev r, rev_py p),                          'percentage'
  UNION ALL
  SELECT 'EBITDA_VS_PRIOR_PCT',    'EBITDA vs Año Ant.',
    (SELECT (e.v - p.v) / ABS(p.v) FROM ebitda e, ebt_py p),                       'percentage'

  -- ── vs Presupuesto (NULL when no budget loaded) ──────────────────────────────
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
