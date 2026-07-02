-- Variance drivers at the parent P&L line level (RRHH, MARKETING, INGRESOS, etc.)
-- per company and period. Aggregates detail lines from fct_pnl_ytd_comparison
-- by joining to their parent in pnl_lines. Used by /api/dashboard/drivers.
with detail_with_parent as (
    select
        c.company_id,
        c.company_name,
        c.period_month,
        pl_parent.code     as pnl_line_code,
        pl_parent.label    as pnl_line_label,
        pl_parent.level    as pnl_line_level,
        pl_parent.sort_order,
        pl_parent.line_type as pnl_line_type,
        sum(c.actual_ytd)  as actual_ytd,
        sum(c.ly_ytd)      as ly_ytd,
        sum(c.budget_ytd)  as budget_ytd
    from {{ ref('fct_pnl_ytd_comparison') }} c
    join {{ ref('stg_active_pnl_lines') }} pl_detail
        on pl_detail.code = c.pnl_line_code
    join {{ ref('stg_active_pnl_lines') }} pl_parent
        on pl_parent.code = pl_detail.parent_code
    where c.show_in_report = true
    group by
        c.company_id,
        c.company_name,
        c.period_month,
        pl_parent.code,
        pl_parent.label,
        pl_parent.level,
        pl_parent.sort_order,
        pl_parent.line_type
)

select
    company_id,
    company_name,
    period_month,
    pnl_line_code,
    pnl_line_label,
    pnl_line_level,
    sort_order,
    pnl_line_type,
    actual_ytd,
    ly_ytd,
    budget_ytd,
    actual_ytd - ly_ytd                                                              as variance_vs_ly,
    case
        when ly_ytd != 0 then (actual_ytd - ly_ytd) / abs(ly_ytd)
        else null
    end                                                                              as variance_vs_ly_pct,
    actual_ytd - budget_ytd                                                          as variance_vs_budget,
    case
        when budget_ytd != 0 then (actual_ytd - budget_ytd) / abs(budget_ytd)
        else null
    end                                                                              as variance_vs_budget_pct,
    abs(actual_ytd - ly_ytd)                                                         as abs_impact_vs_ly,
    abs(actual_ytd - budget_ytd)                                                     as abs_impact_vs_budget
from detail_with_parent
