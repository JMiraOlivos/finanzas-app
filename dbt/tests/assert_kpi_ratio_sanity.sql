-- Warns when EBITDA/Revenue ratio is outside [-200%, +100%].
-- Extreme values indicate a sign convention error or formula bug in the mart.
{{
  config(severity='warn')
}}

select
    company_id,
    company_name,
    period_month,
    revenue_ytd,
    ebitda_ytd,
    round((ebitda_ytd / nullif(revenue_ytd, 0) * 100)::numeric, 1) as ebitda_margin_pct
from {{ ref('fct_dashboard_kpis') }}
where revenue_ytd is not null
  and revenue_ytd != 0
  and ebitda_ytd is not null
  and ebitda_ytd / nullif(revenue_ytd, 0) not between -2 and 1
