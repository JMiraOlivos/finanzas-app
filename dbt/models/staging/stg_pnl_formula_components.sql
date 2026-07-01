select
    formula_key,
    component_line_code,
    operator,
    sort_order
from {{ source('finanzas', 'pnl_formula_components') }}
