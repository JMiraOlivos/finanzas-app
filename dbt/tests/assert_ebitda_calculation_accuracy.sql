-- Fails if fct_dashboard_kpis.ebitda_ytd deviates by more than 1 CLP
-- from the manual YTD sum of EBITDA component lines in fct_pnl_monthly.
with ebitda_components as (
    select component_line_code
    from {{ ref('stg_pnl_formula_components') }}
    where formula_key = 'EBITDA'
),

manual_ytd as (
    select
        company_id,
        period_month,
        sum(sum(amount)) over (
            partition by company_id, date_trunc('year', period_month)
            order by period_month
            rows between unbounded preceding and current row
        ) as ebitda_ytd_manual
    from {{ ref('fct_pnl_monthly') }}
    where pnl_line_code in (select component_line_code from ebitda_components)
    group by company_id, period_month
)

select
    k.company_id,
    k.period_month,
    k.ebitda_ytd,
    m.ebitda_ytd_manual,
    abs(k.ebitda_ytd - coalesce(m.ebitda_ytd_manual, 0)) as diff
from {{ ref('fct_dashboard_kpis') }} k
join manual_ytd m
    on  m.company_id   = k.company_id
    and m.period_month = k.period_month
where abs(k.ebitda_ytd - coalesce(m.ebitda_ytd_manual, 0)) > 1
