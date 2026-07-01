-- Migration 015: financial_comments
-- Allows Finance/admin to attach narrative comments to periods, companies, and P&L lines.
SET search_path TO finanzas;

CREATE TABLE IF NOT EXISTS financial_comments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month   DATE        NOT NULL,
  company_id     UUID        REFERENCES companies(id) ON DELETE SET NULL,
  pnl_line_code  TEXT,
  comment        TEXT        NOT NULL,
  visibility     TEXT        NOT NULL DEFAULT 'internal'
                 CHECK (visibility IN ('internal', 'board')),
  created_by     UUID        NOT NULL REFERENCES app_users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_comments_period
  ON financial_comments(period_month, company_id);
