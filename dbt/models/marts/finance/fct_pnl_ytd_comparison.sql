-- YTD comparison mart: actual vs prior year vs budget, for detail lines per company.
-- Follows the same window-function + LY-join pattern as fct_dashboard_kpis.sql.
-- Subtotals and calculated lines (EBITDA, Resultado) are derived at query time
-- by fn_pnl_ytd_comparison; this model provides the detail-line base.
with
actual_monthly as (
    select
        company_id,
        pnl_line_code,
        pnl_line_label,
        parent_code,
        level,
        sort_order,
        line_type,
        formula_key,
        is_bold,
        is_highlighted,
        show_in_report,
        period_month,
        amount
    from {{ ref('fct_pnl_monthly') }}
),

budget_monthly as (
    select
        b.company_id,
        pl.code        as pnl_line_code,
        b.period_month,
        b.amount
    from {{ ref('stg_budget_monthly') }} b
    join {{ ref('stg_pnl_lines') }} pl on pl.id = b.pnl_line_id
    where b.version_is_active = true
),

ytd_actual as (
    select
        company_id,
        pnl_line_code,
        pnl_line_label,
        parent_code,
        level,
        sort_order,
        line_type,
        formula_key,
        is_bold,
        is_highlighted,
        show_in_report,
        period_month,
        sum(amount) over (
            partition by company_id, pnl_line_code, date_trunc('year', period_month)
            order by period_month
            rows between unbounded preceding and current row
        ) as actual_ytd
    from actual_monthly
),

ytd_budget as (
    select
        company_id,
        pnl_line_code,
        period_month,
        sum(amount) over (
            partition by company_id, pnl_line_code, date_trunc('year', period_month)
            order by period_month
            rows between unbounded preceding and current row
        ) as budget_ytd
    from budget_monthly
)

select
    a.company_id,
    c.name                              as company_name,
    a.pnl_line_code,
    a.pnl_line_label,
    a.parent_code,
    a.level,
    a.sort_order,
    a.line_type,
    a.formula_key,
    a.is_bold,
    a.is_highlighted,
    a.show_in_report,
    a.period_month,
    a.actual_ytd,
    -- Prior year: same calendar month one year back
    coalesce(ly.actual_ytd, 0)         as ly_ytd,
    coalesce(b.budget_ytd, 0)          as budget_ytd
from ytd_actual a
join {{ ref('stg_companies') }} c
    on c.id = a.company_id
left join ytd_actual ly
    on  ly.company_id    = a.company_id
    and ly.pnl_line_code = a.pnl_line_code
    and ly.period_month  = (a.period_month - interval '1 year')::date
left join ytd_budget b
    on  b.company_id    = a.company_id
    and b.pnl_line_code = a.pnl_line_code
    and b.period_month  = a.period_month
