-- Migration 012: rebind fn_pnl_ytd / fn_pnl_lmonth_ytd / fn_pnl_monthly
-- to read from the dbt mart fct_pnl_monthly instead of v_pnl_base_monthly.
-- Signatures and return types are unchanged — no API changes required.
-- Column names match: fct_pnl_monthly exposes pnl_line_code, period_month, amount.
SET search_path TO finanzas;

-- ─── fn_pnl_ytd ──────────────────────────────────────────────────────────────

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
  ytd_start AS (
    SELECT date_trunc('year', p_period_month)::DATE AS v
  ),
  allowed AS (
    SELECT id, name
    FROM companies
    WHERE is_active = TRUE
      AND (p_company_ids IS NULL OR id = ANY(p_company_ids))
  ),

  -- Detail lines: sum monthly amounts from fct_pnl_monthly over the YTD range
  detail AS (
    SELECT
      a.id           AS company_id,
      a.name         AS company_name,
      pl.code        AS line_code,
      pl.label       AS line_label,
      pl.parent_code,
      pl.level,
      pl.sort_order,
      pl.line_type,
      pl.is_bold,
      pl.is_highlighted,
      COALESCE(SUM(m.amount), 0) AS amount
    FROM allowed a
    CROSS JOIN pnl_lines pl
    LEFT JOIN fct_pnl_monthly m
      ON m.company_id = a.id
      AND m.pnl_line_code = pl.code
      AND m.period_month >= (SELECT v FROM ytd_start)
      AND m.period_month <= p_period_month
    WHERE pl.show_in_report = TRUE
      AND pl.line_type = 'detail'
    GROUP BY a.id, a.name, pl.code, pl.label, pl.parent_code, pl.level,
             pl.sort_order, pl.line_type, pl.is_bold, pl.is_highlighted
  ),

  -- Subtotal lines: sum their direct detail children
  subtotals AS (
    SELECT
      a.id           AS company_id,
      a.name         AS company_name,
      pl.code        AS line_code,
      pl.label       AS line_label,
      pl.parent_code,
      pl.level,
      pl.sort_order,
      pl.line_type,
      pl.is_bold,
      pl.is_highlighted,
      COALESCE(SUM(d.amount), 0) AS amount
    FROM allowed a
    JOIN pnl_lines pl ON pl.line_type = 'subtotal' AND pl.show_in_report = TRUE
    LEFT JOIN detail d
      ON d.company_id = a.id
      AND d.parent_code = pl.code
    GROUP BY a.id, a.name, pl.code, pl.label, pl.parent_code, pl.level,
             pl.sort_order, pl.line_type, pl.is_bold, pl.is_highlighted
  ),

  base AS (
    SELECT * FROM detail
    UNION ALL
    SELECT * FROM subtotals
  ),

  -- Calculated lines: EBITDA, RESULTADO_ANTES_IMP, RESULTADO_FINAL
  calculated AS (
    SELECT
      a.id           AS company_id,
      a.name         AS company_name,
      pl.code        AS line_code,
      pl.label       AS line_label,
      pl.parent_code,
      pl.level,
      pl.sort_order,
      pl.line_type,
      pl.is_bold,
      pl.is_highlighted,
      CASE
        WHEN pl.formula_key = 'EBITDA' THEN (
          SELECT COALESCE(SUM(b.amount), 0)
          FROM base b
          WHERE b.company_id = a.id
            AND b.line_code IN (
              'INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
              'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA','NO_OPERACIONALES'
            )
        )
        WHEN pl.formula_key = 'RESULTADO_ANTES_IMP' THEN (
          SELECT COALESCE(SUM(b.amount), 0)
          FROM base b
          WHERE b.company_id = a.id
            AND b.line_code IN (
              'INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
              'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
              'NO_OPERACIONALES','INTERESES_DEPR'
            )
        )
        WHEN pl.formula_key = 'RESULTADO_FINAL' THEN (
          SELECT COALESCE(SUM(b.amount), 0)
          FROM base b
          WHERE b.company_id = a.id
            AND b.line_code IN (
              'INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
              'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
              'NO_OPERACIONALES','INTERESES_DEPR','IMPUESTO'
            )
        )
        ELSE 0
      END AS amount
    FROM allowed a
    JOIN pnl_lines pl ON pl.line_type = 'calculated' AND pl.show_in_report = TRUE
  ),

  all_lines AS (
    SELECT * FROM base
    UNION ALL
    SELECT * FROM calculated
  ),

  revenue AS (
    SELECT company_id, NULLIF(SUM(amount), 0) AS rev
    FROM all_lines
    WHERE line_code = 'INGRESOS'
    GROUP BY company_id
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
  al.amount,
  CASE WHEN r.rev IS NULL THEN NULL ELSE al.amount / r.rev END AS revenue_percentage
FROM all_lines al
LEFT JOIN revenue r ON r.company_id = al.company_id
ORDER BY al.company_name, al.sort_order;

$$;


-- ─── fn_pnl_lmonth_ytd ───────────────────────────────────────────────────────

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
    ytd  AS (SELECT * FROM fn_pnl_ytd(p_period_month, p_company_ids)),
    lmonth_start AS (
        SELECT date_trunc('month', p_period_month)::DATE AS v
    ),
    allowed AS (
      SELECT id, name FROM companies
      WHERE is_active = TRUE
        AND (p_company_ids IS NULL OR id = ANY(p_company_ids))
    ),
    -- Last-month detail from fct_pnl_monthly (single period_month)
    detail_lm AS (
      SELECT
        a.id AS company_id, pl.code AS line_code,
        COALESCE(SUM(m.amount), 0) AS amount
      FROM allowed a
      CROSS JOIN pnl_lines pl
      LEFT JOIN fct_pnl_monthly m
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
      LEFT JOIN detail_lm d ON d.company_id = a.id AND d.line_code IN (
        SELECT code FROM pnl_lines WHERE parent_code = pl.code
      )
      GROUP BY a.id, pl.code
    ),
    base_lm AS (
      SELECT * FROM detail_lm UNION ALL SELECT * FROM subtotals_lm
    ),
    calc_lm AS (
      SELECT a.id AS company_id, pl.code AS line_code,
        CASE
          WHEN pl.formula_key = 'EBITDA' THEN (
            SELECT COALESCE(SUM(b.amount),0) FROM base_lm b WHERE b.company_id=a.id
              AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
                'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA','NO_OPERACIONALES'))
          WHEN pl.formula_key = 'RESULTADO_ANTES_IMP' THEN (
            SELECT COALESCE(SUM(b.amount),0) FROM base_lm b WHERE b.company_id=a.id
              AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
                'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
                'NO_OPERACIONALES','INTERESES_DEPR'))
          WHEN pl.formula_key = 'RESULTADO_FINAL' THEN (
            SELECT COALESCE(SUM(b.amount),0) FROM base_lm b WHERE b.company_id=a.id
              AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
                'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
                'NO_OPERACIONALES','INTERESES_DEPR','IMPUESTO'))
          ELSE 0
        END AS amount
      FROM allowed a
      JOIN pnl_lines pl ON pl.line_type='calculated' AND pl.show_in_report=TRUE
    ),
    all_lm AS (SELECT * FROM base_lm UNION ALL SELECT * FROM calc_lm),
    rev_ytd AS (SELECT company_id, NULLIF(SUM(amount),0) AS rev FROM ytd WHERE line_code='INGRESOS' GROUP BY company_id),
    rev_lm  AS (SELECT company_id, NULLIF(SUM(amount),0) AS rev FROM all_lm WHERE line_code='INGRESOS' GROUP BY company_id)

  SELECT
    y.company_id,
    y.company_name,
    y.line_code,
    y.line_label,
    y.parent_code,
    y.level,
    y.sort_order,
    y.line_type,
    y.is_bold,
    y.is_highlighted,
    COALESCE(lm.amount, 0)                                      AS amount_lmonth,
    y.amount                                                    AS amount_ytd,
    CASE WHEN rl.rev IS NULL THEN NULL ELSE lm.amount / rl.rev END AS revenue_pct_lmonth,
    CASE WHEN ry.rev IS NULL THEN NULL ELSE y.amount  / ry.rev END AS revenue_pct_ytd
  FROM ytd y
  LEFT JOIN all_lm lm ON lm.company_id = y.company_id AND lm.line_code = y.line_code
  LEFT JOIN rev_ytd ry ON ry.company_id = y.company_id
  LEFT JOIN rev_lm  rl ON rl.company_id = y.company_id
  ORDER BY y.company_name, y.sort_order;

$$;


-- ─── fn_pnl_monthly ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_pnl_monthly(
  p_year          INTEGER,
  p_company_ids   UUID[] DEFAULT NULL
)
RETURNS TABLE (
  company_id    UUID,
  company_name  TEXT,
  line_code     TEXT,
  line_label    TEXT,
  parent_code   TEXT,
  level         INTEGER,
  sort_order    INTEGER,
  line_type     TEXT,
  is_bold       BOOLEAN,
  is_highlighted BOOLEAN,
  period_month  DATE,
  amount        NUMERIC
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
    WHERE is_active = TRUE
      AND (p_company_ids IS NULL OR id = ANY(p_company_ids))
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
    LEFT JOIN fct_pnl_monthly b
      ON b.company_id = a.id
      AND b.pnl_line_code = pl.code
      AND b.period_month = mo.m
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
    LEFT JOIN detail d
      ON d.company_id = a.id AND d.parent_code = pl.code AND d.period_month = mo.m
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
      CASE
        WHEN pl.formula_key='EBITDA' THEN (
          SELECT COALESCE(SUM(b2.amount),0) FROM base b2
          WHERE b2.company_id=a.id AND b2.period_month=mo.m
            AND b2.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
              'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA','NO_OPERACIONALES'))
        WHEN pl.formula_key='RESULTADO_ANTES_IMP' THEN (
          SELECT COALESCE(SUM(b2.amount),0) FROM base b2
          WHERE b2.company_id=a.id AND b2.period_month=mo.m
            AND b2.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
              'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
              'NO_OPERACIONALES','INTERESES_DEPR'))
        WHEN pl.formula_key='RESULTADO_FINAL' THEN (
          SELECT COALESCE(SUM(b2.amount),0) FROM base b2
          WHERE b2.company_id=a.id AND b2.period_month=mo.m
            AND b2.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
              'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
              'NO_OPERACIONALES','INTERESES_DEPR','IMPUESTO'))
        ELSE 0
      END AS amount
    FROM allowed a
    JOIN pnl_lines pl ON pl.line_type='calculated' AND pl.show_in_report=TRUE
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
