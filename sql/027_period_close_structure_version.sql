-- PR 1: Agrega referencia a versión de estructura P&L en cierres mensuales.
-- Permite preservar qué estructura se usó al publicar un período.
-- Columna nullable: períodos anteriores al versionamiento no tienen versión asignada.

ALTER TABLE finanzas.financial_period_closes
ADD COLUMN IF NOT EXISTS pnl_structure_version_id UUID
  REFERENCES finanzas.pnl_structure_versions(id);

CREATE INDEX IF NOT EXISTS idx_period_closes_pnl_version
  ON finanzas.financial_period_closes (pnl_structure_version_id)
  WHERE pnl_structure_version_id IS NOT NULL;
