-- Prevent concurrent active versions for the same company/year (budget)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_budget_company_year
  ON finanzas.budget_versions(company_id, year)
  WHERE is_active = TRUE;

-- Prevent concurrent active versions for the same company/year (forecast)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_forecast_company_year
  ON finanzas.forecast_versions(company_id, year)
  WHERE is_active = TRUE;
