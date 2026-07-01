-- Migration 009: pnl_formula_components + refactored SQL functions
-- Replaces hardcoded IN-lists in fn_pnl_ytd / fn_pnl_lmonth_ytd / fn_pnl_monthly
-- with a config table. Safe to re-run (IF NOT EXISTS / ON CONFLICT DO NOTHING / CREATE OR REPLACE).

SET search_path TO finanzas;

-- ─── pnl_formula_components ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pnl_formula_components (
  formula_key           TEXT NOT NULL,
  component_line_code   TEXT NOT NULL,
  operator              TEXT NOT NULL DEFAULT '+' CHECK (operator IN ('+', '-')),
  sort_order            INTEGER,
  PRIMARY KEY (formula_key, component_line_code)
);

-- Seed current formulas (idempotent)
INSERT INTO pnl_formula_components (formula_key, component_line_code, operator, sort_order) VALUES
  -- EBITDA = all operating lines
  ('EBITDA', 'INGRESOS',           '+',  1),
  ('EBITDA', 'GASTOS_VARIABLES',   '+',  2),
  ('EBITDA', 'RRHH',               '+',  3),
  ('EBITDA', 'MARKETING',          '+',  4),
  ('EBITDA', 'GASTOS_ADMIN',       '+',  5),
  ('EBITDA', 'ASESORIAS',          '+',  6),
  ('EBITDA', 'GASTOS_OFICINA',     '+',  7),
  ('EBITDA', 'TECNOLOGIA',         '+',  8),
  ('EBITDA', 'NO_OPERACIONALES',   '+',  9),
  -- RESULTADO_ANTES_IMP = EBITDA components + below-EBITDA
  ('RESULTADO_ANTES_IMP', 'INGRESOS',           '+',  1),
  ('RESULTADO_ANTES_IMP', 'GASTOS_VARIABLES',   '+',  2),
  ('RESULTADO_ANTES_IMP', 'RRHH',               '+',  3),
  ('RESULTADO_ANTES_IMP', 'MARKETING',          '+',  4),
  ('RESULTADO_ANTES_IMP', 'GASTOS_ADMIN',       '+',  5),
  ('RESULTADO_ANTES_IMP', 'ASESORIAS',          '+',  6),
  ('RESULTADO_ANTES_IMP', 'GASTOS_OFICINA',     '+',  7),
  ('RESULTADO_ANTES_IMP', 'TECNOLOGIA',         '+',  8),
  ('RESULTADO_ANTES_IMP', 'NO_OPERACIONALES',   '+',  9),
  ('RESULTADO_ANTES_IMP', 'INTERESES_DEPR',     '+', 10),
  -- RESULTADO_FINAL = RESULTADO_ANTES_IMP + impuestos finales
  ('RESULTADO_FINAL', 'INGRESOS',           '+',  1),
  ('RESULTADO_FINAL', 'GASTOS_VARIABLES',   '+',  2),
  ('RESULTADO_FINAL', 'RRHH',               '+',  3),
  ('RESULTADO_FINAL', 'MARKETING',          '+',  4),
  ('RESULTADO_FINAL', 'GASTOS_ADMIN',       '+',  5),
  ('RESULTADO_FINAL', 'ASESORIAS',          '+',  6),
  ('RESULTADO_FINAL', 'GASTOS_OFICINA',     '+',  7),
  ('RESULTADO_FINAL', 'TECNOLOGIA',         '+',  8),
  ('RESULTADO_FINAL', 'NO_OPERACIONALES',   '+',  9),
  ('RESULTADO_FINAL', 'INTERESES_DEPR',     '+', 10),
  ('RESULTADO_FINAL', 'IMPUESTO',           '+', 11)
ON CONFLICT (formula_key, component_line_code) DO NOTHING;

-- ─── fn_pnl_ytd (refactored) ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_pnl_ytd(
  p_period_month  DATE,
  p_company_ids   UUID[] DEFAULT NULL
)
RETURNS TABLE (
  company_id          UUID,
  company_name        TEXT,
  line_code           TEXT,
  line_label          TEXT,
  parent_code         TEXT,
  level               INTEGER,
  sort_order          INTEGER,
  line_type           TEXT,
  is_bold             BOOLEAN,
  is_highlighted      BOOLEAN,
  amount              NUMERIC,
  revenue_percentage  NUMERIC
)
LANGUAGE SQL STABLE
SET search_path = finanzas
AS $$

WITH
  ytd_start AS (SELECT date_trunc('year', p_period_month)::DATE AS v),
  allowed AS (
    SELECT id, name FROM companies
    WHERE is_active = TRUE AND (p_company_ids IS NULL OR id = ANY(p_company_ids))
  ),
  detail AS (
    SELECT
      a.id AS company_id, a.name AS company_name,
      pl.code AS line_code, pl.label AS line_label,
      pl.parent_code, pl.level, pl.sort_order, pl.line_type,
      pl.is_bold, pl.is_highlighted,
      COALESCE(SUM(m.amount), 0) AS amount
    FROM allowed a
    CROSS JOIN pnl_lines pl
    LEFT JOIN v_pnl_base_monthly m
      ON m.company_id = a.id
      AND m.pnl_line_code = pl.code
      AND m.period_month >= (SELECT v FROM ytd_start)
      AND m.period_month <= p_period_month
    WHERE pl.show_in_report = TRUE AND pl.line_type = 'detail'
    GROUP BY a.id, a.name, pl.code, pl.label, pl.parent_code, pl.level,
             pl.sort_order, pl.line_type, pl.is_bold, pl.is_highlighted
  ),
  subtotals AS (
    SELECT
      a.id AS company_id, a.name AS company_name,
      pl.code AS line_code, pl.label AS line_label,
      pl.parent_code, pl.level, pl.sort_order, pl.line_type,
      pl.is_bold, pl.is_highlighted,
      COALESCE(SUM(d.amount), 0) AS amount
    FROM allowed a
    JOIN pnl_lines pl ON pl.line_type = 'subtotal' AND pl.show_in_report = TRUE
    LEFT JOIN detail d ON d.company_id = a.id AND d.parent_code = pl.code
    GROUP BY a.id, a.name, pl.code, pl.label, pl.parent_code, pl.level,
             pl.sort_order, pl.line_type, pl.is_bold, pl.is_highlighted
  ),
  base AS (SELECT * FROM detail UNION ALL SELECT * FROM subtotals),
  calculated AS (
    SELECT
      a.id AS company_id, a.name AS company_name,
      pl.code AS line_code, pl.label AS line_label,
      pl.parent_code, pl.level, pl.sort_order, pl.line_type,
      pl.is_bold, pl.is_highlighted,
      COALESCE((
        SELECT SUM(b.amount * CASE fc.operator WHEN '-' THEN -1 ELSE 1 END)
        FROM pnl_formula_components fc
        JOIN base b ON b.line_code = fc.component_line_code AND b.company_id = a.id
        WHERE fc.formula_key = pl.formula_key
      ), 0) AS amount
    FROM allowed a
    JOIN pnl_lines pl ON pl.line_type = 'calculated' AND pl.show_in_report = TRUE
  ),
  all_lines AS (SELECT * FROM base UNION ALL SELECT * FROM calculated),
  revenue AS (
    SELECT company_id, NULLIF(SUM(amount), 0) AS rev
    FROM all_lines WHERE line_code = 'INGRESOS'
    GROUP BY company_id
  )

SELECT
  al.company_id, al.company_name, al.line_code, al.line_label,
  al.parent_code, al.level, al.sort_order, al.line_type,
  al.is_bold, al.is_highlighted, al.amount,
  CASE WHEN r.rev IS NULL THEN NULL ELSE al.amount / r.rev END AS revenue_percentage
FROM all_lines al
LEFT JOIN revenue r ON r.company_id = al.company_id
ORDER BY al.company_name, al.sort_order;

$$;

-- ─── fn_pnl_lmonth_ytd (refactored) ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_pnl_lmonth_ytd(
  p_period_month  DATE,
  p_company_ids   UUID[] DEFAULT NULL
)
RETURNS TABLE (
  company_id          UUID,
  company_name        TEXT,
  line_code           TEXT,
  line_label          TEXT,
  parent_code         TEXT,
  level               INTEGER,
  sort_order          INTEGER,
  line_type           TEXT,
  is_bold             BOOLEAN,
  is_highlighted      BOOLEAN,
  amount_lmonth       NUMERIC,
  amount_ytd          NUMERIC,
  revenue_pct_lmonth  NUMERIC,
  revenue_pct_ytd     NUMERIC
)
LANGUAGE SQL STABLE
SET search_path = finanzas
AS $$

  WITH
    ytd         AS (SELECT * FROM fn_pnl_ytd(p_period_month, p_company_ids)),
    lmonth_start AS (SELECT date_trunc('month', p_period_month)::DATE AS v),
    allowed AS (
      SELECT id, name FROM companies
      WHERE is_active = TRUE AND (p_company_ids IS NULL OR id = ANY(p_company_ids))
    ),
    detail_lm AS (
      SELECT
        a.id AS company_id, pl.code AS line_code,
        COALESCE(SUM(m.amount), 0) AS amount
      FROM allowed a
      CROSS JOIN pnl_lines pl
      LEFT JOIN v_pnl_base_monthly m
        ON m.company_id = a.id
        AND m.pnl_line_code = pl.code
        AND m.period_month = (SELECT v FROM lmonth_start)
      WHERE pl.show_in_report = TRUE AND pl.line_type = 'detail'
      GROUP BY a.id, pl.code
    ),
    subtotals_lm AS (
      SELECT a.id AS company_id, pl.code AS line_code,
        COALESCE(SUM(d.amount), 0) AS amount
      FROM allowed a
      JOIN pnl_lines pl ON pl.line_type = 'subtotal' AND pl.show_in_report = TRUE
      LEFT JOIN detail_lm d ON d.company_id = a.id
        AND d.line_code IN (SELECT code FROM pnl_lines WHERE parent_code = pl.code)
      GROUP BY a.id, pl.code
    ),
    base_lm AS (SELECT * FROM detail_lm UNION ALL SELECT * FROM subtotals_lm),
    calc_lm AS (
      SELECT a.id AS company_id, pl.code AS line_code,
        COALESCE((
          SELECT SUM(b.amount * CASE fc.operator WHEN '-' THEN -1 ELSE 1 END)
          FROM pnl_formula_components fc
          JOIN base_lm b ON b.line_code = fc.component_line_code AND b.company_id = a.id
          WHERE fc.formula_key = pl.formula_key
        ), 0) AS amount
      FROM allowed a
      JOIN pnl_lines pl ON pl.line_type = 'calculated' AND pl.show_in_report = TRUE
    ),
    all_lm  AS (SELECT * FROM base_lm UNION ALL SELECT * FROM calc_lm),
    rev_ytd AS (SELECT company_id, NULLIF(SUM(amount), 0) AS rev FROM ytd     WHERE line_code = 'INGRESOS' GROUP BY company_id),
    rev_lm  AS (SELECT company_id, NULLIF(SUM(amount), 0) AS rev FROM all_lm  WHERE line_code = 'INGRESOS' GROUP BY company_id)

  SELECT
    y.company_id, y.company_name, y.line_code, y.line_label,
    y.parent_code, y.level, y.sort_order, y.line_type,
    y.is_bold, y.is_highlighted,
    COALESCE(lm.amount, 0)                                         AS amount_lmonth,
    y.amount                                                       AS amount_ytd,
    CASE WHEN rl.rev IS NULL THEN NULL ELSE lm.amount / rl.rev END AS revenue_pct_lmonth,
    CASE WHEN ry.rev IS NULL THEN NULL ELSE y.amount  / ry.rev END AS revenue_pct_ytd
  FROM ytd y
  LEFT JOIN all_lm  lm ON lm.company_id = y.company_id AND lm.line_code = y.line_code
  LEFT JOIN rev_ytd ry ON ry.company_id = y.company_id
  LEFT JOIN rev_lm  rl ON rl.company_id = y.company_id
  ORDER BY y.company_name, y.sort_order;

$$;

-- ─── fn_pnl_monthly (refactored) ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_pnl_monthly(
  p_year          INTEGER,
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
  period_month   DATE,
  amount         NUMERIC
)
LANGUAGE SQL STABLE
SET search_path = finanzas
AS $$

  WITH months AS (
    SELECT generate_series(
      make_date(p_year, 1, 1),
      make_date(p_year, 12, 1),
      '1 month'
    )::DATE AS m
  ),
  allowed AS (
    SELECT id, name FROM companies
    WHERE is_active = TRUE AND (p_company_ids IS NULL OR id = ANY(p_company_ids))
  ),
  detail AS (
    SELECT
      a.id AS company_id, a.name AS company_name,
      pl.code AS line_code, pl.label AS line_label,
      pl.parent_code, pl.level, pl.sort_order, pl.line_type,
      pl.is_bold, pl.is_highlighted,
      mo.m AS period_month,
      COALESCE(SUM(b.amount), 0) AS amount
    FROM allowed a
    CROSS JOIN pnl_lines pl
    CROSS JOIN months mo
    LEFT JOIN v_pnl_base_monthly b
      ON b.company_id = a.id AND b.pnl_line_code = pl.code AND b.period_month = mo.m
    WHERE pl.show_in_report = TRUE AND pl.line_type = 'detail'
    GROUP BY a.id, a.name, pl.code, pl.label, pl.parent_code, pl.level,
             pl.sort_order, pl.line_type, pl.is_bold, pl.is_highlighted, mo.m
  ),
  subtotals AS (
    SELECT
      a.id AS company_id, a.name AS company_name,
      pl.code AS line_code, pl.label AS line_label,
      pl.parent_code, pl.level, pl.sort_order, pl.line_type,
      pl.is_bold, pl.is_highlighted,
      mo.m AS period_month,
      COALESCE(SUM(d.amount), 0) AS amount
    FROM allowed a
    JOIN pnl_lines pl ON pl.line_type = 'subtotal' AND pl.show_in_report = TRUE
    CROSS JOIN months mo
    LEFT JOIN detail d ON d.company_id = a.id AND d.parent_code = pl.code AND d.period_month = mo.m
    GROUP BY a.id, a.name, pl.code, pl.label, pl.parent_code, pl.level,
             pl.sort_order, pl.line_type, pl.is_bold, pl.is_highlighted, mo.m
  ),
  base AS (SELECT * FROM detail UNION ALL SELECT * FROM subtotals),
  calculated AS (
    SELECT
      a.id AS company_id, a.name AS company_name,
      pl.code AS line_code, pl.label AS line_label,
      pl.parent_code, pl.level, pl.sort_order, pl.line_type,
      pl.is_bold, pl.is_highlighted,
      mo.m AS period_month,
      COALESCE((
        SELECT SUM(b2.amount * CASE fc.operator WHEN '-' THEN -1 ELSE 1 END)
        FROM pnl_formula_components fc
        JOIN base b2 ON b2.line_code = fc.component_line_code
          AND b2.company_id = a.id AND b2.period_month = mo.m
        WHERE fc.formula_key = pl.formula_key
      ), 0) AS amount
    FROM allowed a
    JOIN pnl_lines pl ON pl.line_type = 'calculated' AND pl.show_in_report = TRUE
    CROSS JOIN months mo
  )

  SELECT company_id, company_name, line_code, line_label, parent_code,
         level, sort_order, line_type, is_bold, is_highlighted, period_month, amount
  FROM base
  UNION ALL
  SELECT company_id, company_name, line_code, line_label, parent_code,
         level, sort_order, line_type, is_bold, is_highlighted, period_month, amount
  FROM calculated
  ORDER BY company_name, sort_order, period_month;

$$;
