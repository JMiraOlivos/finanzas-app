-- Unified actual + budget + forecast at (company, period_month, pnl_line_code).
-- PR 3: migrado a pnl_line_code TEXT para todas las ramas.
-- Actual usa pnl_line_code directo desde int_pnl_movements_mapped (versioned).
-- Budget/forecast aún referencian pnl_line_id FK a pnl_lines legacy; se resuelve via JOIN.
with actual as (
    select
        company_id,
        period_month,
        pnl_line_code,
        sum(mapped_amount) as amount,
        'actual'           as scenario
    from {{ ref('int_pnl_movements_mapped') }}
    group by company_id, period_month, pnl_line_code
),
budget as (
    select
        b.company_id,
        b.period_month,
        pl.code            as pnl_line_code,
        b.amount,
        'budget'           as scenario
    from {{ ref('stg_budget_monthly') }} b
    join {{ ref('stg_pnl_lines') }} pl on pl.id = b.pnl_line_id
    where b.version_is_active = true
),
forecast as (
    select
        f.company_id,
        f.period_month,
        pl.code            as pnl_line_code,
        f.amount,
        'forecast'         as scenario
    from {{ ref('stg_forecast_monthly') }} f
    join {{ ref('stg_pnl_lines') }} pl on pl.id = f.pnl_line_id
    where f.version_is_active = true
)
select * from actual
union all
select * from budget
union all
select * from forecast
