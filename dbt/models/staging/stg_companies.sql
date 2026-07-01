select
    id,
    name,
    country,
    base_currency,
    is_active,
    created_at
from {{ source('finanzas', 'companies') }}
