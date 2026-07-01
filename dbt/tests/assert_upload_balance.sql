{{
  config(
    description="Every processed upload must have total_debit = total_credit within 1 CLP."
  )
}}

-- Returns rows (FAIL) when |total_debit - total_credit| > 1 CLP.
-- NULL totals are skipped (upload parser didn't capture checksums).
select
    id            as file_id,
    company_id,
    period_month,
    total_debit,
    total_credit,
    abs(total_debit - total_credit) as imbalance
from {{ ref('int_active_uploads') }}
where total_debit  is not null
  and total_credit is not null
  and abs(total_debit - total_credit) > 1
