-- PR 1: Tabla principal de versiones de estructura P&L.
-- Una sola versión puede estar is_active=true al mismo tiempo (enforced por unique partial index).

CREATE TABLE IF NOT EXISTS finanzas.pnl_structure_versions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  name              TEXT        NOT NULL,
  description       TEXT,

  status            TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'archived')),

  is_active         BOOLEAN     NOT NULL DEFAULT FALSE,

  effective_from    DATE,
  effective_to      DATE,

  source_version_id UUID        REFERENCES finanzas.pnl_structure_versions(id),

  created_by        UUID        REFERENCES finanzas.app_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_by        UUID        REFERENCES finanzas.app_users(id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  published_by      UUID        REFERENCES finanzas.app_users(id),
  published_at      TIMESTAMPTZ,

  archived_by       UUID        REFERENCES finanzas.app_users(id),
  archived_at       TIMESTAMPTZ,

  notes             TEXT
);

-- Solo una versión activa a la vez
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_pnl_structure_version
  ON finanzas.pnl_structure_versions (is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_pnl_structure_versions_status
  ON finanzas.pnl_structure_versions (status);

CREATE INDEX IF NOT EXISTS idx_pnl_structure_versions_created_at
  ON finanzas.pnl_structure_versions (created_at DESC);

-- Vista de la versión activa — usada por dbt staging en PR 2/3
CREATE OR REPLACE VIEW finanzas.v_active_pnl_structure_version AS
SELECT *
FROM finanzas.pnl_structure_versions
WHERE is_active = TRUE
  AND status = 'published';
