select
    id,
    -- company_id NULL means the mapping applies to all companies (global)
    company_id,
    account_code,
    account_name,
    pnl_line_id,
    sign_multiplier,
    is_active,
    created_at
from {{ source('finanzas', 'account_pnl_mappings') }}
