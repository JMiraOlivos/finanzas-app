-- Líneas P&L de la versión activa publicada.
-- Equivalente funcional de stg_pnl_lines pero versionado.
-- PR 3 migra los marts para usar este modelo en vez de stg_pnl_lines.
select
    l.id,
    l.structure_version_id,
    l.code,
    l.label,
    l.parent_code,
    l.level,
    l.sort_order,
    l.line_type,
    l.formula_key,
    l.show_in_report,
    l.is_bold,
    l.is_highlighted,
    l.is_active
from {{ source('finanzas', 'pnl_lines_versioned') }} l
join {{ source('finanzas', 'pnl_structure_versions') }} v
    on v.id = l.structure_version_id
where v.is_active = true
  and v.status = 'published'
  and l.is_active = true
