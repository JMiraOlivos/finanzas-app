select
    id,
    code,
    label,
    parent_code,
    level,
    sort_order,
    line_type,
    formula_key,
    is_bold,
    is_highlighted,
    show_in_report,
    created_at
from {{ source('finanzas', 'pnl_lines') }}
