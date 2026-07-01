-- Data quality check per uploaded file.
-- Feeds /admin/control semáforos: green = OK, yellow = unmapped accounts,
-- red = debit/credit imbalance > 1 CLP or stuck upload.
with balance_check as (
    select
        u.id            as file_id,
        u.company_id,
        u.period_month,
        u.total_debit,
        u.total_credit,
        abs(
            coalesce(u.total_debit, 0) - coalesce(u.total_credit, 0)
        )                                           as imbalance
    from {{ ref('int_active_uploads') }} u
),
unmapped as (
    -- P&L entries from active uploads with no resolved mapping
    select
        je.company_id,
        je.period_month,
        count(distinct je.account_code)             as unmapped_account_count,
        sum(abs(je.amount))                         as unmapped_amount
    from {{ ref('int_active_journal_entries') }} je
    left join {{ ref('int_account_mapping_resolved') }} m
        on  m.company_id   = je.company_id
        and m.account_code = je.account_code
    where je.is_pnl = true
      and m.pnl_line_id is null
    group by je.company_id, je.period_month
),
stuck as (
    -- Uploads in 'processing' status for more than 30 minutes
    select
        company_id,
        count(*) as stuck_count
    from {{ ref('stg_uploaded_files') }}
    where status = 'processing'
      and created_at < now() - interval '30 minutes'
    group by company_id
)
select
    b.file_id,
    b.company_id,
    c.name                                          as company_name,
    b.period_month,
    b.total_debit,
    b.total_credit,
    b.imbalance,
    coalesce(u.unmapped_account_count, 0)           as unmapped_account_count,
    coalesce(u.unmapped_amount, 0)                  as unmapped_amount,
    coalesce(s.stuck_count, 0)                      as stuck_uploads,
    case
        when b.imbalance > 1                        then 'red'
        when coalesce(u.unmapped_amount, 0) > 0     then 'yellow'
        else                                             'green'
    end                                             as status
from balance_check b
join {{ ref('stg_companies') }} c
    on c.id = b.company_id
left join unmapped u
    on  u.company_id   = b.company_id
    and u.period_month = b.period_month
left join stuck s
    on s.company_id = b.company_id
