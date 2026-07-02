-- Migration 017: extend dbt_run_history with completion tracking
-- Adds completed_at, error_message and github_run_id so GitHub Actions can
-- POST back the result and the dashboard can show accurate freshness.
SET search_path TO finanzas;

ALTER TABLE dbt_run_history
  ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_message  TEXT,
  ADD COLUMN IF NOT EXISTS github_run_id  TEXT;
