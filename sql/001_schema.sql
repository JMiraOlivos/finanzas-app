-- Schema: finanzas (existing)
-- Run this ONCE against Neon to create new portal tables.
-- Existing tables (fact_libro_diario, dim_pnl_mapping_rule, cargas_libro_diario) are NOT touched.

SET search_path TO finanzas;

-- ─── companies ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  country       TEXT NOT NULL DEFAULT 'Chile',
  base_currency TEXT NOT NULL DEFAULT 'CLP',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── app_users ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  full_name     TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'partner'
    CHECK (role IN ('admin', 'finance', 'director', 'partner', 'stakeholder')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── user_company_access ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_company_access (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  can_view             BOOLEAN NOT NULL DEFAULT TRUE,
  can_export           BOOLEAN NOT NULL DEFAULT FALSE,
  can_admin            BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_movements   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

-- ─── uploaded_files ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS uploaded_files (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  original_filename TEXT NOT NULL,
  file_hash         TEXT NOT NULL,
  period_month      DATE,
  status            TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'processing', 'processed', 'failed', 'replaced')),
  row_count         INTEGER NOT NULL DEFAULT 0,
  total_debit       NUMERIC(18, 2),
  total_credit      NUMERIC(18, 2),
  error_message     TEXT,
  uploaded_by       UUID REFERENCES app_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, file_hash)
);

-- ─── journal_entries ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journal_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  uploaded_file_id  UUID REFERENCES uploaded_files(id) ON DELETE SET NULL,
  entry_date        DATE NOT NULL,
  period_month      DATE NOT NULL,
  account_code      TEXT NOT NULL,
  account_name      TEXT,
  description       TEXT,
  document_number   TEXT,
  cost_center       TEXT,
  debit             NUMERIC(18, 2) NOT NULL DEFAULT 0,
  credit            NUMERIC(18, 2) NOT NULL DEFAULT 0,
  -- amount = credit - debit. Ingresos > 0, Gastos < 0.
  amount            NUMERIC(18, 2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'CLP',
  is_pnl            BOOLEAN NOT NULL DEFAULT FALSE,
  source_row_number INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_je_company_period
  ON journal_entries(company_id, period_month);
CREATE INDEX IF NOT EXISTS idx_je_company_account
  ON journal_entries(company_id, account_code);
CREATE INDEX IF NOT EXISTS idx_je_uploaded_file
  ON journal_entries(uploaded_file_id);
CREATE INDEX IF NOT EXISTS idx_je_period_month
  ON journal_entries(period_month);

-- ─── pnl_lines ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pnl_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT NOT NULL UNIQUE,
  label            TEXT NOT NULL,
  parent_code      TEXT,
  level            INTEGER NOT NULL DEFAULT 0,
  sort_order       INTEGER NOT NULL,
  line_type        TEXT NOT NULL DEFAULT 'detail'
    CHECK (line_type IN ('detail', 'subtotal', 'calculated')),
  formula_key      TEXT,   -- 'EBITDA', 'RESULTADO_ANTES_IMP', 'RESULTADO_FINAL'
  is_bold          BOOLEAN NOT NULL DEFAULT FALSE,
  is_highlighted   BOOLEAN NOT NULL DEFAULT FALSE,
  show_in_report   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── account_pnl_mappings ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS account_pnl_mappings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES companies(id),  -- NULL = applies to all companies
  account_code     TEXT NOT NULL,
  account_name     TEXT,
  pnl_line_id      UUID NOT NULL REFERENCES pnl_lines(id),
  sign_multiplier  INTEGER NOT NULL DEFAULT 1
    CHECK (sign_multiplier IN (-1, 1)),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_apm_company_account
  ON account_pnl_mappings(company_id, account_code);

-- ─── audit_log ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES app_users(id),
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    UUID,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
