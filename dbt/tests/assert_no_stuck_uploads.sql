{{
  config(
    severity='warn',
    description="Uploads stuck in 'processing' for more than 30 minutes indicate a failed ingestion."
  )
}}

-- Returns rows (WARN) for each upload that has been in 'processing' > 30 min.
select
    id as file_id,
    company_id,
    original_filename,
    created_at,
    now() - created_at as time_stuck
from {{ ref('stg_uploaded_files') }}
where status = 'processing'
  and created_at < now() - interval '30 minutes'
