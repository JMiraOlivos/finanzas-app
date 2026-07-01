select
    id,
    company_id,
    original_filename,
    file_hash,
    period_month,
    status,
    row_count,
    total_debit,
    total_credit,
    error_message,
    uploaded_by,
    superseded_by,
    created_at
from {{ ref('stg_uploaded_files') }}
where status = 'processed'
