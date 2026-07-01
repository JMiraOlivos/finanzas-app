-- Monthly P&L amounts for detail lines, per company.
-- Equivalent to v_pnl_base_monthly but sourced through the dbt active-upload filter.
-- Subtotals and calculated lines (EBITDA, Resultado) are derived at query time
-- by the SQL functions; this model provides the detail-line base.
select
    m.company_id,
    c.name                  as company_name,
    pl.code                 as pnl_line_code,
    pl.label                as pnl_line_label,
    pl.parent_code,
    pl.level,
    pl.sort_order,
    pl.line_type,
    pl.formula_key,
    pl.is_bold,
    pl.is_highlighted,
    pl.show_in_report,
    m.period_month,
    sum(m.mapped_amount)    as amount
from {{ ref('int_pnl_movements_mapped') }} m
join {{ ref('stg_companies') }}  c  on c.id  = m.company_id
join {{ ref('stg_pnl_lines') }}  pl on pl.id = m.pnl_line_id
group by
    m.company_id,
    c.name,
    pl.code,
    pl.label,
    pl.parent_code,
    pl.level,
    pl.sort_order,
    pl.line_type,
    pl.formula_key,
    pl.is_bold,
    pl.is_highlighted,
    pl.show_in_report,
    m.period_month
