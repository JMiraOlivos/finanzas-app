-- Mappings cuenta → línea P&L de la versión activa publicada.
-- Expone pnl_line_code (TEXT) en vez de pnl_line_id (UUID) del staging legacy.
-- PR 3 actualiza int_account_mapping_resolved para usar este modelo.
select
    m.id,
    m.structure_version_id,
    -- company_id NULL = mapeo global (aplica a todas las empresas)
    m.company_id,
    m.account_code,
    m.account_name,
    m.pnl_line_code,
    m.sign_multiplier,
    m.is_active
from {{ source('finanzas', 'account_pnl_mappings_versioned') }} m
join {{ source('finanzas', 'pnl_structure_versions') }} v
    on v.id = m.structure_version_id
where v.is_active = true
  and v.status = 'published'
  and m.is_active = true
