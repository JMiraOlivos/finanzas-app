-- PR 1: Seed inicial — copia pnl_lines, account_pnl_mappings y pnl_formula_components
-- hacia las tablas versionadas, creando una versión "Estructura inicial" published + active.
-- El DO block es idempotente: no hace nada si ya existen versiones.

DO $$
DECLARE
  v_version_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM finanzas.pnl_structure_versions LIMIT 1) THEN
    RAISE NOTICE 'pnl_structure_versions ya tiene datos — seed omitido.';
    RETURN;
  END IF;

  INSERT INTO finanzas.pnl_structure_versions (
    name,
    description,
    status,
    is_active,
    notes
  )
  VALUES (
    'Estructura inicial',
    'Versión migrada automáticamente desde pnl_lines, account_pnl_mappings y pnl_formula_components.',
    'published',
    TRUE,
    'Creada durante migración 028.'
  )
  RETURNING id INTO v_version_id;

  -- Líneas P&L
  INSERT INTO finanzas.pnl_lines_versioned (
    structure_version_id,
    code,
    label,
    parent_code,
    level,
    sort_order,
    line_type,
    formula_key,
    show_in_report,
    is_bold,
    is_highlighted,
    is_active
  )
  SELECT
    v_version_id,
    code,
    label,
    parent_code,
    level,
    sort_order,
    line_type,
    formula_key,
    show_in_report,
    is_bold,
    is_highlighted,
    TRUE
  FROM finanzas.pnl_lines;

  -- Mappings — convierte pnl_line_id (UUID FK) → pnl_line_code (TEXT)
  INSERT INTO finanzas.account_pnl_mappings_versioned (
    structure_version_id,
    company_id,
    account_code,
    account_name,
    pnl_line_code,
    sign_multiplier,
    is_active
  )
  SELECT
    v_version_id,
    m.company_id,
    m.account_code,
    m.account_name,
    pl.code,
    m.sign_multiplier,
    m.is_active
  FROM finanzas.account_pnl_mappings m
  JOIN finanzas.pnl_lines pl ON pl.id = m.pnl_line_id;

  -- Fórmulas — convierte operator TEXT ('+'/'-') → INTEGER (1/-1)
  INSERT INTO finanzas.pnl_formula_components_versioned (
    structure_version_id,
    formula_key,
    component_line_code,
    operator,
    sort_order
  )
  SELECT
    v_version_id,
    formula_key,
    component_line_code,
    CASE operator WHEN '+' THEN 1 ELSE -1 END,
    COALESCE(sort_order, 10)
  FROM finanzas.pnl_formula_components;

  RAISE NOTICE 'Seed completado — estructura inicial id: %', v_version_id;
END;
$$;
