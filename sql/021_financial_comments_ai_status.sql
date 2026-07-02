ALTER TABLE finanzas.financial_comments
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'
  CHECK (status IN ('draft', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES finanzas.app_users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
