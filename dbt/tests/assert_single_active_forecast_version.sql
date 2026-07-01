{{
  config(
    description="At most one active forecast version per company/year. Enforced by unique index 010_constraints.sql."
  )
}}

-- Returns rows (FAIL) if more than one active forecast version exists for the same company/year.
select
    company_id,
    year,
    count(*) as active_versions
from {{ source('finanzas', 'forecast_versions') }}
where is_active = true
group by company_id, year
having count(*) > 1
