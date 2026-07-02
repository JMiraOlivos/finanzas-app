-- PR 1: Componentes de fórmulas P&L versionados.
-- operator es INTEGER 1/-1 (en vez de TEXT +/- de la tabla legacy).
-- El seed convierte '+' → 1 y '-' → -1.

CREATE TABLE IF NOT EXISTS finanzas.pnl_formula_components_versioned (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  structure_version_id UUID        NOT NULL
                       REFERENCES finanzas.pnl_structure_versions(id)
                       ON DELETE CASCADE,

  formula_key          TEXT        NOT NULL,
  component_line_code  TEXT        NOT NULL,

  operator             INTEGER     NOT NULL DEFAULT 1
                       CHECK (operator IN (-1, 1)),

  sort_order           INTEGER     NOT NULL DEFAULT 10,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (structure_version_id, formula_key, component_line_code)
);

CREATE INDEX IF NOT EXISTS idx_pfcv_version
  ON finanzas.pnl_formula_components_versioned (structure_version_id);

CREATE INDEX IF NOT EXISTS idx_pfcv_formula_key
  ON finanzas.pnl_formula_components_versioned (structure_version_id, formula_key);
