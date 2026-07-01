-- Fails if revenue_ytd in fct_dashboard_kpis deviates by more than 1 CLP
-- from the manual running sum of INGRESOS in fct_pnl_monthly.
with manual_ytd as (
    select
        company_id,
        period_month,
        sum(sum(amount)) over (
            partition by company_id, date_trunc('year', period_month)
            order by period_month
            rows between unbounded preceding and current row
        ) as revenue_ytd_manual
    from {{ ref('fct_pnl_monthly') }}
    where pnl_line_code = 'INGRESOS'
    group by company_id, period_month
)

select
    k.company_id,
    k.period_month,
    k.revenue_ytd,
    m.revenue_ytd_manual,
    abs(k.revenue_ytd - coalesce(m.revenue_ytd_manual, 0)) as diff
from {{ ref('fct_dashboard_kpis') }} k
join manual_ytd m
    on  m.company_id   = k.company_id
    and m.period_month = k.period_month
where abs(k.revenue_ytd - coalesce(m.revenue_ytd_manual, 0)) > 1
