select
    fm.id,
    fm.version_id,
    fm.company_id,
    fm.pnl_line_id,
    fm.period_month,
    fm.amount,
    fv.year,
    fv.name         as version_name,
    fv.is_active    as version_is_active,
    fv.created_by,
    fv.created_at
from {{ source('finanzas', 'forecast_monthly') }} fm
join {{ source('finanzas', 'forecast_versions') }} fv
    on fv.id = fm.version_id
