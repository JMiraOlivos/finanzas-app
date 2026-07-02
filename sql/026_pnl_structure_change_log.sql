-- PR 1: Log específico de cambios de estructura P&L.
-- Complementa audit_log con before/after JSON para diffs granulares.

CREATE TABLE IF NOT EXISTS finanzas.pnl_structure_change_log (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  structure_version_id UUID        NOT NULL
                       REFERENCES finanzas.pnl_structure_versions(id),

  change_type          TEXT        NOT NULL,
  entity_type          TEXT        NOT NULL,
  entity_code          TEXT,

  before_value         JSONB,
  after_value          JSONB,

  changed_by           UUID        REFERENCES finanzas.app_users(id),
  changed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pscl_version
  ON finanzas.pnl_structure_change_log (structure_version_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pscl_changed_at
  ON finanzas.pnl_structure_change_log (changed_at DESC);
