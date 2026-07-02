select
    bm.id,
    bm.version_id,
    bm.company_id,
    bm.pnl_line_code,
    bm.period_month,
    bm.amount,
    bv.year,
    bv.name         as version_name,
    bv.is_active    as version_is_active,
    bv.created_by,
    bv.created_at
from {{ source('finanzas', 'budget_monthly') }} bm
join {{ source('finanzas', 'budget_versions') }} bv
    on bv.id = bm.version_id
