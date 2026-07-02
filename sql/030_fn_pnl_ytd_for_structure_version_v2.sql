-- PR 11: Update fn_pnl_ytd_for_structure_version to support company filtering
-- and include is_bold / is_highlighted in the return type (needed by board-pack PDF).
-- CREATE OR REPLACE is safe — no data affected, only function signature changes.

CREATE OR REPLACE FUNCTION finanzas.fn_pnl_ytd_for_structure_version(
  p_period_month DATE,
  p_version_id   UUID,
  p_company_ids  UUID[] DEFAULT NULL
)
RETURNS TABLE (
  pnl_line_code  TEXT,
  pnl_line_label TEXT,
  line_type      TEXT,
  sort_order     INTEGER,
  parent_code    TEXT,
  level          INTEGER,
  is_bold        BOOLEAN,
  is_highlighted BOOLEAN,
  amount_ytd     NUMERIC
)
LANGUAGE SQL STABLE AS $$
  WITH
  -- Distinct active PNL accounts (optionally filtered to specific companies)
  active_accounts AS (
    SELECT DISTINCT je.company_id, je.account_code
    FROM finanzas.journal_entries je
    JOIN finanzas.uploaded_files uf ON uf.id = je.uploaded_file_id
    WHERE je.is_pnl = true
      AND uf.status = 'processed'
      AND (p_company_ids IS NULL OR je.company_id = ANY(p_company_ids))
  ),
  -- Resolve mapping per (company, account): company-specific beats global
  mapping_resolved AS (
    SELECT DISTINCT ON (aa.company_id, aa.account_code)
      aa.company_id,
      aa.account_code,
      m.pnl_line_code,
      m.sign_multiplier
    FROM active_accounts aa
    JOIN finanzas.account_pnl_mappings_versioned m
      ON  m.account_code         = aa.account_code
      AND (m.company_id IS NULL OR m.company_id = aa.company_id)
      AND m.is_active            = true
      AND m.structure_version_id = p_version_id
    ORDER BY aa.company_id, aa.account_code, (m.company_id IS NOT NULL) DESC
  ),
  -- YTD amount per detail line, aggregated across companies, date-filtered
  detail_amounts AS (
    SELECT
      mr.pnl_line_code,
      SUM(je.amount * mr.sign_multiplier) AS amount_ytd
    FROM finanzas.journal_entries je
    JOIN finanzas.uploaded_files uf ON uf.id = je.uploaded_file_id
    JOIN mapping_resolved mr
      ON  mr.account_code = je.account_code
      AND mr.company_id   = je.company_id
    WHERE je.is_pnl = true
      AND uf.status = 'processed'
      AND je.period_month >= date_trunc('year', p_period_month::timestamp)::date
      AND je.period_month <= p_period_month
    GROUP BY mr.pnl_line_code
  ),
  -- Calculated line amounts from formula components
  calc_amounts AS (
    SELECT
      fc.formula_key                                 AS pnl_line_code,
      SUM(COALESCE(da.amount_ytd, 0) * fc.operator) AS amount_ytd
    FROM finanzas.pnl_formula_components_versioned fc
    LEFT JOIN detail_amounts da ON da.pnl_line_code = fc.component_line_code
    WHERE fc.structure_version_id = p_version_id
    GROUP BY fc.formula_key
  )
  SELECT
    pl.code,
    pl.label,
    pl.line_type,
    pl.sort_order,
    pl.parent_code,
    pl.level,
    pl.is_bold,
    pl.is_highlighted,
    CASE pl.line_type
      WHEN 'detail'     THEN COALESCE(da.amount_ytd, 0)
      WHEN 'calculated' THEN COALESCE(ca.amount_ytd, 0)
      ELSE NULL
    END AS amount_ytd
  FROM finanzas.pnl_lines_versioned pl
  LEFT JOIN detail_amounts da ON da.pnl_line_code = pl.code AND pl.line_type = 'detail'
  LEFT JOIN calc_amounts   ca ON ca.pnl_line_code = pl.formula_key AND pl.line_type = 'calculated'
  WHERE pl.structure_version_id = p_version_id
    AND pl.is_active = true
  ORDER BY pl.sort_order
$$;
