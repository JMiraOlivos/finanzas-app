-- P&L journal entries joined to their resolved pnl_line mapping.
-- Excludes unmapped accounts (those appear in dq_financial_control).
-- PR 3: lleva pnl_line_code TEXT (antes pnl_line_id UUID) desde int_account_mapping_resolved.
select
    je.id                                       as journal_entry_id,
    je.company_id,
    je.uploaded_file_id,
    je.entry_date,
    je.period_month,
    je.account_code,
    je.account_name,
    je.debit,
    je.credit,
    je.amount,
    je.currency,
    m.pnl_line_code,
    m.sign_multiplier,
    je.amount * m.sign_multiplier               as mapped_amount
from {{ ref('int_active_journal_entries') }} je
inner join {{ ref('int_account_mapping_resolved') }} m
    on  m.company_id   = je.company_id
    and m.account_code = je.account_code
where je.is_pnl = true
