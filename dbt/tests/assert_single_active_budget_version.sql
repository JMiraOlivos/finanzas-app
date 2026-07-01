{{
  config(
    description="At most one active budget version per company/year. Enforced by unique index 010_constraints.sql."
  )
}}

-- Returns rows (FAIL) if more than one active budget version exists for the same company/year.
-- Should never happen after migration 010, but guards against concurrent inserts.
select
    company_id,
    year,
    count(*) as active_versions
from {{ source('finanzas', 'budget_versions') }}
where is_active = true
group by company_id, year
having count(*) > 1
