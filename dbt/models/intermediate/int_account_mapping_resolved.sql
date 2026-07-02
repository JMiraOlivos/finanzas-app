-- Resolved mapping per (company, account_code): company-specific beats global.
-- PR 3: migrado a stg_active_account_pnl_mappings (versioned). Produce pnl_line_code TEXT.
with active_accounts as (
    select distinct company_id, account_code
    from {{ ref('int_active_journal_entries') }}
    where is_pnl = true
),
ranked as (
    select
        aa.company_id,
        aa.account_code,
        m.pnl_line_code,
        m.sign_multiplier,
        row_number() over (
            partition by aa.company_id, aa.account_code
            -- company-specific mapping (company_id not null) ranks above global (null)
            order by (m.company_id is not null) desc
        ) as rn
    from active_accounts aa
    join {{ ref('stg_active_account_pnl_mappings') }} m
        on m.account_code = aa.account_code
        and (m.company_id is null or m.company_id = aa.company_id)
)
select
    company_id,
    account_code,
    pnl_line_code,
    sign_multiplier
from ranked
where rn = 1
