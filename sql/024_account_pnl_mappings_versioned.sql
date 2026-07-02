-- PR 1: Mappings de cuentas contables a líneas P&L, versionados.
-- pnl_line_code es TEXT (no FK) para mantener estabilidad entre versiones.
-- Precedencia: mapping company-specific gana sobre global (company_id IS NULL).
-- UNIQUE con NULL company_id se resuelve con dos partial indexes.

CREATE TABLE IF NOT EXISTS finanzas.account_pnl_mappings_versioned (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  structure_version_id UUID        NOT NULL
                       REFERENCES finanzas.pnl_structure_versions(id)
                       ON DELETE CASCADE,

  company_id           UUID        REFERENCES finanzas.companies(id),

  account_code         TEXT        NOT NULL,
  account_name         TEXT,

  pnl_line_code        TEXT        NOT NULL,

  sign_multiplier      INTEGER     NOT NULL DEFAULT 1
                       CHECK (sign_multiplier IN (-1, 1)),

  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,

  created_by           UUID        REFERENCES finanzas.app_users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_by           UUID        REFERENCES finanzas.app_users(id),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dos partial indexes en vez de UNIQUE(structure_version_id, company_id, account_code)
-- porque Postgres trata dos NULLs como distintos en constraints UNIQUE normales.
CREATE UNIQUE INDEX IF NOT EXISTS uq_apmv_company_specific
  ON finanzas.account_pnl_mappings_versioned (structure_version_id, company_id, account_code)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_apmv_global
  ON finanzas.account_pnl_mappings_versioned (structure_version_id, account_code)
  WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_apmv_version
  ON finanzas.account_pnl_mappings_versioned (structure_version_id);

CREATE INDEX IF NOT EXISTS idx_apmv_account
  ON finanzas.account_pnl_mappings_versioned (structure_version_id, account_code);

CREATE INDEX IF NOT EXISTS idx_apmv_company
  ON finanzas.account_pnl_mappings_versioned (structure_version_id, company_id);
