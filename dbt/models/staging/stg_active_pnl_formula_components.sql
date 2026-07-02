-- Componentes de fórmulas de la versión activa publicada.
-- operator es INTEGER (1/-1) en vez de TEXT (+/-) del staging legacy.
-- PR 3 actualiza fct_dashboard_kpis para usar este modelo.
select
    f.structure_version_id,
    f.formula_key,
    f.component_line_code,
    f.operator,
    f.sort_order
from {{ source('finanzas', 'pnl_formula_components_versioned') }} f
join {{ source('finanzas', 'pnl_structure_versions') }} v
    on v.id = f.structure_version_id
where v.is_active = true
  and v.status = 'published'
