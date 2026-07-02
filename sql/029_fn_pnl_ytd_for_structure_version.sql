-- PR 9: SQL function that replicates the dbt pipeline
-- (int_account_mapping_resolved → int_pnl_movements_mapped → fct_pnl_monthly)
-- parametrised by structure_version_id.
-- Used by the preview API to compare a draft version against the active published one.

CREATE OR REPLACE FUNCTION finanzas.fn_pnl_ytd_for_structure_version(
  p_period_month DATE,
  p_version_id   UUID
)
RETURNS TABLE (
  pnl_line_code  TEXT,
  pnl_line_label TEXT,
  line_type      TEXT,
  sort_order     INTEGER,
  parent_code    TEXT,
  level          INTEGER,
  amount_ytd     NUMERIC
)
LANGUAGE SQL STABLE AS $$
  WITH
  -- Step 1: distinct active PNL accounts across all processed uploads (no date filter)
  -- mirrors the active_accounts CTE in int_account_mapping_resolved
  active_accounts AS (
    SELECT DISTINCT je.company_id, je.account_code
    FROM finanzas.journal_entries je
    JOIN finanzas.uploaded_files uf ON uf.id = je.uploaded_file_id
    WHERE je.is_pnl = true
      AND uf.status = 'processed'
  ),
  -- Step 2: resolve mapping per (company, account): company-specific beats global
  -- mirrors ROW_NUMBER() OVER (... ORDER BY (company_id IS NOT NULL) DESC) rn=1
  mapping_resolved AS (
    SELECT DISTINCT ON (aa.company_id, aa.account_code)
      aa.company_id,
      aa.account_code,
      m.pnl_line_code,
      m.sign_multiplier
    FROM active_accounts aa
    JOIN finanzas.account_pnl_mappings_versioned m
      ON  m.account_code       = aa.account_code
      AND (m.company_id IS NULL OR m.company_id = aa.company_id)
      AND m.is_active          = true
      AND m.structure_version_id = p_version_id
    ORDER BY aa.company_id, aa.account_code, (m.company_id IS NOT NULL) DESC
  ),
  -- Step 3: YTD amount per detail line (all companies aggregated, date-filtered)
  -- mirrors int_pnl_movements_mapped + fct_pnl_monthly grouped to YTD
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
  -- Step 4: calculated line amounts from formula components
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
    pl.code        AS pnl_line_code,
    pl.label       AS pnl_line_label,
    pl.line_type,
    pl.sort_order,
    pl.parent_code,
    pl.level,
    CASE pl.line_type
      WHEN 'detail'     THEN COALESCE(da.amount_ytd, 0)
      WHEN 'calculated' THEN COALESCE(ca.amount_ytd, 0)
      ELSE NULL  -- subtotals not computed here; dbt derives them at mart layer
    END            AS amount_ytd
  FROM finanzas.pnl_lines_versioned pl
  LEFT JOIN detail_amounts da
    ON  da.pnl_line_code = pl.code
    AND pl.line_type = 'detail'
  LEFT JOIN calc_amounts ca
    ON  ca.pnl_line_code = pl.formula_key
    AND pl.line_type = 'calculated'
  WHERE pl.structure_version_id = p_version_id
    AND pl.is_active = true
  ORDER BY pl.sort_order
$$;
