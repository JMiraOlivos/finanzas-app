SET search_path TO finanzas;

CREATE TABLE IF NOT EXISTS ai_analysis_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month    DATE        NOT NULL,
  scope           JSONB       NOT NULL DEFAULT '{}',
  analysis_type   TEXT        NOT NULL DEFAULT 'period_summary',
  prompt_version  TEXT        NOT NULL,
  model_name      TEXT        NOT NULL,
  analyst_output  JSONB,
  cfo_output      TEXT,
  final_output    JSONB       NOT NULL,
  created_by      UUID        REFERENCES app_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_runs_period    ON ai_analysis_runs(period_month);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_runs_created_by ON ai_analysis_runs(created_by);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_runs_type      ON ai_analysis_runs(analysis_type);
