-- Unified actual + budget + forecast at (company, period_month, pnl_line_id).
-- Actual comes from mapped movements; budget/forecast from active versions only.
with actual as (
    select
        company_id,
        period_month,
        pnl_line_id,
        sum(mapped_amount) as amount,
        'actual'           as scenario
    from {{ ref('int_pnl_movements_mapped') }}
    group by company_id, period_month, pnl_line_id
),
budget as (
    select
        company_id,
        period_month,
        pnl_line_id,
        amount,
        'budget' as scenario
    from {{ ref('stg_budget_monthly') }}
    where version_is_active = true
),
forecast as (
    select
        company_id,
        period_month,
        pnl_line_id,
        amount,
        'forecast' as scenario
    from {{ ref('stg_forecast_monthly') }}
    where version_is_active = true
)
select * from actual
union all
select * from budget
union all
select * from forecast
