select
    id,
    company_id,
    uploaded_file_id,
    entry_date,
    period_month,
    account_code,
    account_name,
    description,
    document_number,
    cost_center,
    debit,
    credit,
    -- amount = credit - debit. Ingresos > 0, gastos < 0
    amount,
    currency,
    is_pnl,
    source_row_number,
    created_at
from {{ source('finanzas', 'journal_entries') }}
