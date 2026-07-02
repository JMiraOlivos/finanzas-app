-- Migration 035: remove bridge JOIN in fn_pnl_ytd_comparison budget_all CTE.
-- After migration 034, budget_monthly.pnl_line_code is a direct TEXT column,
-- so the temporary JOIN to pnl_lines to resolve code from pnl_line_id is gone.
SET search_path TO finanzas;

DROP FUNCTION IF EXISTS finanzas.fn_pnl_ytd_comparison(DATE, UUID[]);

CREATE FUNCTION finanzas.fn_pnl_ytd_comparison(
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
LANGUAGE plpgsql STABLE
SET search_path = finanzas
AS $$
BEGIN
  RETURN QUERY
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

    active_lines AS (
      SELECT *
      FROM pnl_lines_versioned
      WHERE structure_version_id = (
        SELECT id FROM pnl_structure_versions WHERE is_active = true LIMIT 1
      )
      AND is_active = true
    ),

    -- ── Actual YTD (dbt mart, versioned mappings) ────────────────────────────
    actual_detail AS (
      SELECT a.id AS company_id, pl.code AS line_code,
             COALESCE(SUM(m.amount), 0)::NUMERIC AS amount
      FROM allowed a
      CROSS JOIN active_lines pl
      LEFT JOIN fct_pnl_monthly m
        ON  m.company_id    = a.id
        AND m.pnl_line_code = pl.code
        AND m.period_month >= (SELECT v FROM ytd_start)
        AND m.period_month <= p_period_month
      WHERE pl.show_in_report = TRUE AND pl.line_type = 'detail'
      GROUP BY a.id, pl.code
    ),

    -- ── LY YTD (dbt mart, prior-year date range) ─────────────────────────────
    ly_detail AS (
      SELECT a.id AS company_id, pl.code AS line_code,
             SUM(m.amount)::NUMERIC AS amount
      FROM allowed a
      CROSS JOIN active_lines pl
      LEFT JOIN fct_pnl_monthly m
        ON  m.company_id    = a.id
        AND m.pnl_line_code = pl.code
        AND m.period_month >= (SELECT v FROM ly_start)
        AND m.period_month <= (SELECT v FROM ly_end)
      WHERE pl.show_in_report = TRUE AND pl.line_type = 'detail'
      GROUP BY a.id, pl.code
    ),

    -- ── Budget YTD: active version, pnl_line_code direct ─────────────────────
    budget_all AS (
      SELECT a.id AS company_id, pl.code AS line_code,
             SUM(bm.amount)::NUMERIC AS amount
      FROM allowed a
      CROSS JOIN active_lines pl
      LEFT JOIN (
        SELECT bm2.company_id, bm2.pnl_line_code, bm2.period_month, bm2.amount
        FROM budget_monthly bm2
        JOIN budget_versions bv ON bv.id = bm2.version_id AND bv.is_active = TRUE
      ) bm ON  bm.company_id    = a.id
           AND bm.pnl_line_code = pl.code
           AND bm.period_month >= (SELECT v FROM ytd_start)
           AND bm.period_month <= p_period_month
      WHERE pl.show_in_report = TRUE
      GROUP BY a.id, pl.code
    ),

    -- ── Combine three amounts per (company, detail_line) ─────────────────────
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
        COALESCE(ac.amount, 0)::NUMERIC AS actual_ytd,
        ly.amount::NUMERIC              AS ly_ytd,
        ba.amount::NUMERIC              AS budget_ytd
      FROM allowed a
      CROSS JOIN active_lines pl
      LEFT JOIN actual_detail ac ON ac.company_id = a.id AND ac.line_code = pl.code
      LEFT JOIN ly_detail     ly ON ly.company_id = a.id AND ly.line_code = pl.code
      LEFT JOIN budget_all    ba ON ba.company_id = a.id AND ba.line_code = pl.code
      WHERE pl.show_in_report = TRUE AND pl.line_type = 'detail'
    ),

    -- ── Subtotals: sum detail children ───────────────────────────────────────
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
        COALESCE(SUM(d.actual_ytd), 0)::NUMERIC                     AS actual_ytd,
        SUM(d.ly_ytd)::NUMERIC                                       AS ly_ytd,
        CASE
          WHEN SUM(d.budget_ytd) IS NULL AND MAX(ba.amount) IS NULL THEN NULL
          ELSE COALESCE(SUM(d.budget_ytd), 0) + COALESCE(MAX(ba.amount), 0)
        END::NUMERIC                                                  AS budget_ytd
      FROM allowed a
      JOIN active_lines pl ON pl.line_type = 'subtotal' AND pl.show_in_report = TRUE
      LEFT JOIN detail d
        ON  d.company_id  = a.id
        AND d.parent_code = pl.code
      LEFT JOIN budget_all ba
        ON  ba.company_id = a.id
        AND ba.line_code  = pl.code
      GROUP BY a.id, a.name, pl.code, pl.label, pl.parent_code, pl.level,
               pl.sort_order, pl.line_type, pl.is_bold, pl.is_highlighted
    ),

    base AS (
      SELECT * FROM detail
      UNION ALL
      SELECT * FROM subtotals
    ),

    -- ── Calculated lines ──────────────────────────────────────────────────────
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
        END::NUMERIC AS actual_ytd,
        CASE
          WHEN pl.formula_key = 'EBITDA' THEN (
            SELECT CASE WHEN BOOL_OR(b.ly_ytd IS NOT NULL)
                        THEN COALESCE(SUM(b.ly_ytd), 0) ELSE NULL END
            FROM base b WHERE b.company_id = a.id
              AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
                'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA','NO_OPERACIONALES'))
          WHEN pl.formula_key = 'RESULTADO_ANTES_IMP' THEN (
            SELECT CASE WHEN BOOL_OR(b.ly_ytd IS NOT NULL)
                        THEN COALESCE(SUM(b.ly_ytd), 0) ELSE NULL END
            FROM base b WHERE b.company_id = a.id
              AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
                'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
                'NO_OPERACIONALES','INTERESES_DEPR'))
          WHEN pl.formula_key = 'RESULTADO_FINAL' THEN (
            SELECT CASE WHEN BOOL_OR(b.ly_ytd IS NOT NULL)
                        THEN COALESCE(SUM(b.ly_ytd), 0) ELSE NULL END
            FROM base b WHERE b.company_id = a.id
              AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
                'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
                'NO_OPERACIONALES','INTERESES_DEPR','IMPUESTO'))
          ELSE NULL
        END::NUMERIC AS ly_ytd,
        CASE
          WHEN pl.formula_key = 'EBITDA' THEN (
            SELECT CASE WHEN BOOL_OR(b.budget_ytd IS NOT NULL)
                        THEN COALESCE(SUM(b.budget_ytd), 0) ELSE NULL END
            FROM base b WHERE b.company_id = a.id
              AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
                'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA','NO_OPERACIONALES'))
          WHEN pl.formula_key = 'RESULTADO_ANTES_IMP' THEN (
            SELECT CASE WHEN BOOL_OR(b.budget_ytd IS NOT NULL)
                        THEN COALESCE(SUM(b.budget_ytd), 0) ELSE NULL END
            FROM base b WHERE b.company_id = a.id
              AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
                'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
                'NO_OPERACIONALES','INTERESES_DEPR'))
          WHEN pl.formula_key = 'RESULTADO_FINAL' THEN (
            SELECT CASE WHEN BOOL_OR(b.budget_ytd IS NOT NULL)
                        THEN COALESCE(SUM(b.budget_ytd), 0) ELSE NULL END
            FROM base b WHERE b.company_id = a.id
              AND b.line_code IN ('INGRESOS','GASTOS_VARIABLES','RRHH','MARKETING',
                'GASTOS_ADMIN','ASESORIAS','GASTOS_OFICINA','TECNOLOGIA',
                'NO_OPERACIONALES','INTERESES_DEPR','IMPUESTO'))
          ELSE NULL
        END::NUMERIC AS budget_ytd
      FROM allowed a
      JOIN active_lines pl ON pl.line_type = 'calculated' AND pl.show_in_report = TRUE
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
END;
$$;
