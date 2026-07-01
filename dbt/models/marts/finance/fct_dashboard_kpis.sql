-- Pre-computes YTD dashboard KPI amounts per (company, period_month).
-- The API sums across companies (filtered by allowedIds), then derives ratios.
-- EBITDA and Resultado components are read from pnl_formula_components — do not
-- add formulas here; update the table instead.
with ebitda_components as (
    select component_line_code
    from {{ ref('stg_pnl_formula_components') }}
    where formula_key = 'EBITDA'
),

resultado_components as (
    select component_line_code
    from {{ ref('stg_pnl_formula_components') }}
    where formula_key = 'RESULTADO_FINAL'
),

monthly_actual as (
    select
        company_id,
        period_month,
        -- Match detail lines (pnl_line_code) OR child lines (parent_code) to handle
        -- both actual data (stored at detail level) and budget data (may be at subtotal level).
        sum(case when pnl_line_code in (select component_line_code from ebitda_components)
                   or parent_code    in (select component_line_code from ebitda_components)
                 then amount else 0 end)                                        as ebitda_monthly,
        sum(case when pnl_line_code in (select component_line_code from resultado_components)
                   or parent_code    in (select component_line_code from resultado_components)
                 then amount else 0 end)                                        as resultado_monthly,
        sum(case when pnl_line_code = 'INGRESOS'  or parent_code = 'INGRESOS'  then amount else 0 end) as revenue_monthly,
        sum(case when pnl_line_code = 'RRHH'      or parent_code = 'RRHH'      then amount else 0 end) as rrhh_monthly,
        sum(case when pnl_line_code = 'MARKETING' or parent_code = 'MARKETING' then amount else 0 end) as mkt_monthly
    from {{ ref('fct_scenario_monthly') }}
    where scenario = 'actual'
    group by company_id, period_month
),

monthly_budget as (
    select
        company_id,
        period_month,
        sum(case when pnl_line_code in (select component_line_code from ebitda_components)
                   or parent_code    in (select component_line_code from ebitda_components)
                 then amount else 0 end)                                        as ebitda_monthly,
        sum(case when pnl_line_code = 'INGRESOS'  or parent_code = 'INGRESOS'  then amount else 0 end) as revenue_monthly
    from {{ ref('fct_scenario_monthly') }}
    where scenario = 'budget'
    group by company_id, period_month
),

ytd_actual as (
    select
        company_id,
        period_month,
        sum(revenue_monthly)   over w as revenue_ytd,
        sum(ebitda_monthly)    over w as ebitda_ytd,
        sum(resultado_monthly) over w as resultado_ytd,
        sum(rrhh_monthly)      over w as rrhh_ytd,
        sum(mkt_monthly)       over w as mkt_ytd
    from monthly_actual
    window w as (
        partition by company_id, date_trunc('year', period_month)
        order by period_month
        rows between unbounded preceding and current row
    )
),

ytd_budget as (
    select
        company_id,
        period_month,
        sum(revenue_monthly) over w as revenue_ytd,
        sum(ebitda_monthly)  over w as ebitda_ytd
    from monthly_budget
    window w as (
        partition by company_id, date_trunc('year', period_month)
        order by period_month
        rows between unbounded preceding and current row
    )
)

select
    a.company_id,
    c.name                          as company_name,
    a.period_month,
    -- Actual YTD amounts (ratios computed by the API after cross-company aggregation)
    a.revenue_ytd,
    a.ebitda_ytd,
    a.resultado_ytd,
    a.rrhh_ytd,
    a.mkt_ytd,
    -- Prior year actual YTD (same month-of-year, year - 1)
    pr.revenue_ytd                  as revenue_ytd_prior,
    pr.ebitda_ytd                   as ebitda_ytd_prior,
    -- Budget YTD
    b.revenue_ytd                   as revenue_ytd_budget,
    b.ebitda_ytd                    as ebitda_ytd_budget
from ytd_actual a
join {{ ref('stg_companies') }} c   on c.id = a.company_id
left join ytd_actual pr
    on  pr.company_id   = a.company_id
    and pr.period_month = (a.period_month - interval '1 year')::date
left join ytd_budget b
    on  b.company_id   = a.company_id
    and b.period_month = a.period_month
