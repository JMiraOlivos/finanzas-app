-- Migration 013: budget account name → pnl_line mapping support
-- Adds staging table for raw budget rows and a persistent mapping table.
SET search_path TO finanzas;

-- Raw budget rows from upload, pending mapping to pnl_lines
CREATE TABLE IF NOT EXISTS budget_staging (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id   UUID NOT NULL REFERENCES budget_versions(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id),
  account_name TEXT NOT NULL,
  period_month DATE NOT NULL,
  amount       NUMERIC(15,2) NOT NULL,
  source_row   INT
);

CREATE INDEX IF NOT EXISTS idx_budget_staging_version
  ON budget_staging(version_id);

-- Persistent mapping: budget account name → pnl_line
-- company_id NULL means the mapping applies to all companies.
CREATE TABLE IF NOT EXISTS budget_account_mappings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name TEXT NOT NULL,
  company_id   UUID REFERENCES companies(id),
  pnl_line_id  UUID NOT NULL REFERENCES pnl_lines(id),
  created_by   UUID REFERENCES app_users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active    BOOL NOT NULL DEFAULT TRUE,
  UNIQUE (account_name, company_id)
);

CREATE INDEX IF NOT EXISTS idx_budget_account_mappings_name
  ON budget_account_mappings(LOWER(account_name), company_id);
