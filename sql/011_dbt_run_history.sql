-- Migration 011: dbt run history tracking
-- Records each time a dbt run is triggered so the control dashboard
-- can show "Marts actualizados: hace X min" to the finance team.
SET search_path TO finanzas;

CREATE TABLE IF NOT EXISTS dbt_run_history (
  id             SERIAL PRIMARY KEY,
  triggered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger_source TEXT        NOT NULL DEFAULT 'upload',
  status         TEXT        NOT NULL DEFAULT 'triggered'
    CHECK (status IN ('triggered', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_dbt_run_history_triggered_at
  ON dbt_run_history (triggered_at DESC);
