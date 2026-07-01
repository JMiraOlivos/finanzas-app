-- Active journal entries: from processed uploads + legacy migrated entries (no file ref).
-- Excludes entries from replaced/failed uploads.
select je.*
from {{ ref('stg_journal_entries') }} je
left join {{ ref('stg_uploaded_files') }} uf
    on uf.id = je.uploaded_file_id
where je.uploaded_file_id is null   -- legacy entries migrated from fact_libro_diario
   or uf.status = 'processed'
