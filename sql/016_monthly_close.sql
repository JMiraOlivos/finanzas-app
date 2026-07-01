-- Migration 016: financial_period_closes
-- Tracks the close/publish lifecycle of each reporting period.
SET search_path TO finanzas;

CREATE TABLE IF NOT EXISTS financial_period_closes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month   DATE        NOT NULL UNIQUE,
  status         TEXT        NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'closed', 'published')),
  closed_by      UUID        REFERENCES app_users(id),
  closed_at      TIMESTAMPTZ,
  published_by   UUID        REFERENCES app_users(id),
  published_at   TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_period_closes_period
  ON financial_period_closes(period_month);
