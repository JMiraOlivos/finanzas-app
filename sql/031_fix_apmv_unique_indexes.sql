-- The existing partial unique indexes cover ALL rows (active + inactive),
-- which blocks the deactivate+insert upsert pattern used for remapping.
-- Recreate them scoped to is_active = true so inactive history rows
-- are allowed to coexist with a new active mapping for the same key.

DROP INDEX IF EXISTS finanzas.uq_apmv_company_specific;
DROP INDEX IF EXISTS finanzas.uq_apmv_global;

CREATE UNIQUE INDEX uq_apmv_company_specific
  ON finanzas.account_pnl_mappings_versioned (structure_version_id, company_id, account_code)
  WHERE company_id IS NOT NULL AND is_active = true;

CREATE UNIQUE INDEX uq_apmv_global
  ON finanzas.account_pnl_mappings_versioned (structure_version_id, account_code)
  WHERE company_id IS NULL AND is_active = true;
