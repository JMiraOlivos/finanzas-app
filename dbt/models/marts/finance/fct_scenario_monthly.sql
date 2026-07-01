-- Real vs presupuesto vs forecast por (empresa, período, línea PnL), con metadata de línea.
-- Fuente para vistas de varianza en dashboard y EERR vs presupuesto.
select
    s.company_id,
    c.name          as company_name,
    pl.code         as pnl_line_code,
    pl.label        as pnl_line_label,
    pl.parent_code,
    pl.level,
    pl.sort_order,
    pl.line_type,
    pl.is_bold,
    pl.is_highlighted,
    pl.show_in_report,
    s.period_month,
    s.scenario,
    s.amount
from {{ ref('int_scenario_monthly') }} s
join {{ ref('stg_companies') }}  c  on c.id  = s.company_id
join {{ ref('stg_pnl_lines') }}  pl on pl.id = s.pnl_line_id
