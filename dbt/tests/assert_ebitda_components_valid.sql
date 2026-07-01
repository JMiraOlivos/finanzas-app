{{
  config(
    description="Every formula component_line_code must exist in pnl_lines. Prevents silent zero-out in EBITDA/Resultado calculations."
  )
}}

-- Returns rows (FAIL) for formula components that reference non-existent pnl_line codes.
select
    fc.formula_key,
    fc.component_line_code
from {{ ref('stg_pnl_formula_components') }} fc
left join {{ ref('stg_pnl_lines') }} pl
    on pl.code = fc.component_line_code
where pl.id is null
