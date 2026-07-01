-- Migration 014: fn_pnl_ytd_comparison
-- Returns the full P&L hierarchy (detail → subtotals → calculated) with three
-- simultaneous YTD amounts: actual, prior-year, and active budget.
-- Self-contained: reads from fct_pnl_monthly + budget_monthly directly (no dbt mart required).
-- Mirrors fn_pnl_ytd structure from 012_pnl_functions_v2.sql.
SET search_path TO finanzas;

CREATE OR REPLACE FUNCTION fn_pnl_ytd_comparison(
  p_period_month  DATE,
  p_company_ids   UUID[] DEFAULT NULL
)
RETURNS TABLE (
  company_id     UUID,
  company_name   TEXT,
  line_code      TEXT,
  line_label     TEXT,
  parent_code    TEXT,
  level          INTEGER,
  sort_order     INTEGER,
  line_type      TEXT,
  is_bold        BOOLEAN,
  is_highlighted BOOLEAN,
  actual_ytd     NUMERIC,
  ly_ytd         NUMERIC,
  budget_ytd     NUMERIC
)
LANGUAGE SQL STABLE
SET search_path = finanzas
AS $$

WITH
  ytd_start AS (SELECT date_trunc('year', p_period_month)::DATE AS v),
  ly_end    AS (SELECT (p_period_month - INTERVAL '1 year')::DATE AS v),
  ly_start  AS (SELECT date_trunc('year', (p_period_month - INTERVAL '1 year'))::DATE AS v),

  allowed AS (
    SELECT id, name
    FROM companies
    WHERE is_active = TRUE
      AND (p_company_ids IS NULL OR id = ANY(p_company_ids))
  ),

  -- ── Actual YTD: same pattern as fn_pnl_ytd ─────────────────────────────────
  actual_detail AS (
    SELECT a.id AS company_id, pl.code AS line_code,
           COALESCE(SUM(m.amount), 0) AS amount
    FROM allowed a
    CROSS JOIN pnl_lines pl
    LEFT JOIN fct_pnl_monthly m
      ON  m.company_id    = a.id
      AND m.pnl_line_code = pl.code
      AND m.period_month >= (SELECT v FROM ytd_start)
      AND m.period_month <= p_period_month
    WHERE pl.show_in_report = TRUE AND pl.line_type = 'detail'
    GROUP BY a.id, pl.code
  ),

  -- ── LY YTD: same window shifted 1 year back ─────────────────────────────────
  ly_detail AS (
    SELECT a.id AS company_id, pl.code AS line_code,
           COALESCE(SUM(m.amount), 0) AS amount
    FROM allowed a
    CROSS JOIN pnl_lines pl
    LEFT JOIN fct_pnl_monthly m
      ON  m.company_id    = a.id
      AND m.pnl_line_code = pl.code
      AND m.period_month >= (SELECT v FROM ly_start)
      AND m.period_month <= (SELECT v FROM ly_end)
    WHERE pl.show_in_report = TRUE AND pl.line_type = 'detail'
    GROUP BY a.id, pl.code
  ),

  -- ── Budget YTD: active version, same date range as actual ────────────────────
  budget_detail AS (
    SELECT a.id AS company_id, pl.code AS line_code,
           COALESCE(SUM(bm.amount), 0) AS amount
    FROM allowed a
    CROSS JOIN pnl_lines pl
    LEFT JOIN (
      SELECT bm2.company_id, bm2.pnl_line_id, bm2.period_month, bm2.amount
      FROM budget_monthly bm2
      JOIN budget_versions bv ON bv.id = bm2.version_id AND bv.is_active = TRUE
    ) bm ON  bm.company_id   = a.id
         AND bm.pnl_line_id  = pl.id
         AND bm.period_month >= (SELECT v FROM ytd_start)
         AND bm.period_month <= p_period_month
    WHERE pl.show_in_report = TRUE AND pl.line_type = 'detail'
    GROUP BY a.id, pl.code
  ),

  -- ── Combine three amounts into one detail row per (company, line) ────────────
  detail AS (
    SELECT
      a.id              AS company_id,
      a.name            AS company_name,
      pl.code           AS line_code,
      pl.label          AS line_label,
      pl.parent_code,
      pl.level,
      pl.sort_order,
      pl.line_type,
      pl.is_bold,
      pl.is_highlighted,
      COALESCE(ac.amount, 0) AS actual_ytd,
      COALESCE(ly.amount, 0) AS ly_ytd,
      COALESCE(bd.amount, 0) AS budget_ytd
    FROM allowed a
    CROSS JOIN pnl_lines pl
    LEFT JOIN actual_detail ac ON ac.company_id = a.id AND ac.line_code = pl.code
    LEFT JOIN ly_detail     ly ON ly.company_id = a.id AND ly.line_code = pl.code
    LEFT JOIN budget_detail bd ON bd.company_id = a.id AND bd.line_code = pl.code
    WHERE pl.show_in_report = TRUE AND pl.line_type = 'detail'
  ),

  -- ── Subtotal lines: sum direct detail children ───────────────────────────────
  subtotals AS (
    SELECT
      a.id              AS company_id,
      a.name            AS company_name,
      pl.code           AS line_code,
      pl.label          AS line_label,
      pl.parent_code,
      pl.level,
      pl.sort_order,
      pl.line_type,
      pl.is_bold,
      pl.is_highlighted,
      COALESCE(SUM(d.actual_ytd), 0) AS actual_ytd,
      COALESCE(SUM(d.ly_ytd),     0) AS ly_ytd,
      COALESCE(SUM(d.budget_ytd), 0) AS budget_ytd
    FROM allowed a
    JOIN pnl_lines pl ON pl.line_type = 'subtotal' AND pl.show_in_report = TRUE
    LEFT JOIN detail d
      ON  d.company_id  = a.id
      AND d.parent_code = pl.code
    GROUP BY a.id, a.name, pl.code, pl.label, pl.parent_code, pl.level,
             pl.sort_order, pl.line_type, pl.is_bold, pl.is_highlighted
  ),

  base AS (
    SELECT * FROM detail
    UNION ALL
    SELECT * FROM subtotals
  ),

  -- ── Calculated lines: EBITDA, RESULTADO_ANTES_IMP, RESULTADO_FINAL ───────────
  -- Mirrors hardcoded lists from fn_pnl_ytd (same convention as 012_pnl_functions_v2)
  calculated AS (
    SELECT
      a.id              AS company_id,
      a.name            AS company_name,
      pl.code           AS line_code,
      pl.label          AS line_label,
      pl.parent_code,
      pl.level,
      pl.sort_order,
      pl.line_type,
      pl.is_bold,
      pl.is_highlighted,
      CASE
        WHEN pl.formula_key = 'EBITDA' THEN (
          SELECT COALESCE(SUM(b.actual_ytd), 0) FROM base b WHERE b.company_id = a.id
            AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
              'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA','NO_OPERACIONALES'))
        WHEN pl.formula_key = 'RESULTADO_ANTES_IMP' THEN (
          SELECT COALESCE(SUM(b.actual_ytd), 0) FROM base b WHERE b.company_id = a.id
            AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
              'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
              'NO_OPERACIONALES','INTERESES_DEPR'))
        WHEN pl.formula_key = 'RESULTADO_FINAL' THEN (
          SELECT COALESCE(SUM(b.actual_ytd), 0) FROM base b WHERE b.company_id = a.id
            AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
              'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
              'NO_OPERACIONALES','INTERESES_DEPR','IMPUESTO'))
        ELSE 0
      END AS actual_ytd,
      CASE
        WHEN pl.formula_key = 'EBITDA' THEN (
          SELECT COALESCE(SUM(b.ly_ytd), 0) FROM base b WHERE b.company_id = a.id
            AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
              'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA','NO_OPERACIONALES'))
        WHEN pl.formula_key = 'RESULTADO_ANTES_IMP' THEN (
          SELECT COALESCE(SUM(b.ly_ytd), 0) FROM base b WHERE b.company_id = a.id
            AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
              'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
              'NO_OPERACIONALES','INTERESES_DEPR'))
        WHEN pl.formula_key = 'RESULTADO_FINAL' THEN (
          SELECT COALESCE(SUM(b.ly_ytd), 0) FROM base b WHERE b.company_id = a.id
            AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
              'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
              'NO_OPERACIONALES','INTERESES_DEPR','IMPUESTO'))
        ELSE 0
      END AS ly_ytd,
      CASE
        WHEN pl.formula_key = 'EBITDA' THEN (
          SELECT COALESCE(SUM(b.budget_ytd), 0) FROM base b WHERE b.company_id = a.id
            AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
              'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA','NO_OPERACIONALES'))
        WHEN pl.formula_key = 'RESULTADO_ANTES_IMP' THEN (
          SELECT COALESCE(SUM(b.budget_ytd), 0) FROM base b WHERE b.company_id = a.id
            AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
              'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
              'NO_OPERACIONALES','INTERESES_DEPR'))
        WHEN pl.formula_key = 'RESULTADO_FINAL' THEN (
          SELECT COALESCE(SUM(b.budget_ytd), 0) FROM base b WHERE b.company_id = a.id
            AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
              'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
              'NO_OPERACIONALES','INTERESES_DEPR','IMPUESTO'))
        ELSE 0
      END AS budget_ytd
    FROM allowed a
    JOIN pnl_lines pl ON pl.line_type = 'calculated' AND pl.show_in_report = TRUE
  )

SELECT
  al.company_id,
  al.company_name,
  al.line_code,
  al.line_label,
  al.parent_code,
  al.level,
  al.sort_order,
  al.line_type,
  al.is_bold,
  al.is_highlighted,
  al.actual_ytd,
  al.ly_ytd,
  al.budget_ytd
FROM (
  SELECT * FROM base
  UNION ALL
  SELECT * FROM calculated
) al
ORDER BY al.company_name, al.sort_order;

$$;
