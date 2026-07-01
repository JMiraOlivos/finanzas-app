{{
  config(
    severity='warn',
    description="Unmapped P&L amount should be < 5% of total P&L movement per company/period."
  )
}}

-- Returns rows (WARN) when unmapped P&L amount exceeds 5% of total for a company/period.
-- Use dbt run-operation or /admin/control to diagnose missing mappings.
with total_pnl as (
    select
        company_id,
        period_month,
        sum(abs(amount)) as total_amount
    from {{ ref('int_active_journal_entries') }}
    where is_pnl = true
    group by company_id, period_month
),
mapped_pnl as (
    select
        company_id,
        period_month,
        sum(abs(mapped_amount)) as mapped_amount
    from {{ ref('int_pnl_movements_mapped') }}
    group by company_id, period_month
)
select
    t.company_id,
    t.period_month,
    round(t.total_amount, 0)                                           as total_pnl_amount,
    round(coalesce(m.mapped_amount, 0), 0)                             as mapped_amount,
    round(t.total_amount - coalesce(m.mapped_amount, 0), 0)            as unmapped_amount,
    round(
        (t.total_amount - coalesce(m.mapped_amount, 0))
        / nullif(t.total_amount, 0) * 100,
        1
    )                                                                  as unmapped_pct
from total_pnl t
left join mapped_pnl m
    on  m.company_id   = t.company_id
    and m.period_month = t.period_month
where t.total_amount > 0
  and (t.total_amount - coalesce(m.mapped_amount, 0))
      / nullif(t.total_amount, 0) > 0.05
