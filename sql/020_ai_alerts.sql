CREATE TABLE IF NOT EXISTS finanzas.ai_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month    DATE NOT NULL,
  company_id      UUID REFERENCES finanzas.companies(id),
  alert_type      TEXT NOT NULL DEFAULT 'finding'
                    CHECK (alert_type IN ('finding', 'risk', 'data_quality')),
  category        TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  title           TEXT NOT NULL,
  detail          TEXT,
  source_run_id   UUID,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'acknowledged', 'resolved')),
  acknowledged_by UUID REFERENCES finanzas.app_users(id),
  acknowledged_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_alerts_period_idx  ON finanzas.ai_alerts(period_month);
CREATE INDEX IF NOT EXISTS ai_alerts_company_idx ON finanzas.ai_alerts(company_id);
CREATE INDEX IF NOT EXISTS ai_alerts_status_idx  ON finanzas.ai_alerts(status);
