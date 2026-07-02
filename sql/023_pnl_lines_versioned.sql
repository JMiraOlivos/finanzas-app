-- PR 1: Líneas P&L versionadas.
-- Cada versión de estructura tiene su propio set de líneas.
-- code es estable dentro de una versión; parent_code referencia otro code en la misma versión.

CREATE TABLE IF NOT EXISTS finanzas.pnl_lines_versioned (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  structure_version_id UUID        NOT NULL
                       REFERENCES finanzas.pnl_structure_versions(id)
                       ON DELETE CASCADE,

  code                 TEXT        NOT NULL,
  label                TEXT        NOT NULL,

  parent_code          TEXT,
  level                INTEGER     NOT NULL DEFAULT 1,
  sort_order           INTEGER     NOT NULL,

  line_type            TEXT        NOT NULL
                       CHECK (line_type IN ('detail', 'subtotal', 'calculated')),

  formula_key          TEXT,

  show_in_report       BOOLEAN     NOT NULL DEFAULT TRUE,
  is_bold              BOOLEAN     NOT NULL DEFAULT FALSE,
  is_highlighted       BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (structure_version_id, code)
);

CREATE INDEX IF NOT EXISTS idx_pnl_lines_versioned_version
  ON finanzas.pnl_lines_versioned (structure_version_id);

CREATE INDEX IF NOT EXISTS idx_pnl_lines_versioned_parent
  ON finanzas.pnl_lines_versioned (structure_version_id, parent_code);

CREATE INDEX IF NOT EXISTS idx_pnl_lines_versioned_sort
  ON finanzas.pnl_lines_versioned (structure_version_id, sort_order);
