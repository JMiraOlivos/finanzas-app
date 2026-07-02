// Financial Context Pack — types shared across all AI features

export type MetricSeverity = "high" | "medium" | "low";
export type MetricStatus   = "red" | "yellow" | "green" | "blue" | "gray";

// ── Scope ──────────────────────────────────────────────────────────────────

export type FinancialContextScope = {
  period: string;            // "YYYY-MM-DD" (last day of month)
  companyIds: string[] | null; // null = all allowed
  requestedMetric?: string | null;
  requestedPnlLine?: string | null;
  comparisonMode?: "ly" | "budget" | "ly_budget" | null;
};

// ── KPI summary ────────────────────────────────────────────────────────────

export type KpiSummary = {
  code: string;
  label: string;
  value: number | null;
  format: string;
  // Only populated for REVENUE_YTD and EBITDA_YTD
  vsPriorPct?: number | null;
  vsBudgetPct?: number | null;
};

// ── Bullet KPI (one row per company × metric) ─────────────────────────────

export type BulletKpiContext = {
  companyId: string;
  companyName: string;
  metricCode: "REVENUE_YTD" | "EBITDA_YTD";
  actual: number | null;
  target: number | null;
  ly: number | null;
  attainmentPct: number | null;
  varianceVsTarget: number | null;
  varianceVsTargetPct: number | null;
  status: MetricStatus;
};

// ── Variance drivers ───────────────────────────────────────────────────────

export type VarianceDriverContext = {
  pnlLineCode: string;
  pnlLineLabel: string;
  companyId: string;
  companyName: string;
  actual: number | null;
  budget: number | null;
  varianceVsBudget: number | null;
  varianceVsBudgetPct: number | null;
  ly: number | null;
  varianceVsLy: number | null;
  varianceVsLyPct: number | null;
  basis: "budget" | "ly";
};

// ── Data quality ───────────────────────────────────────────────────────────

export type DataQualityItem = {
  companyId: string;
  companyName: string;
  controlType: string;
  status: "ok" | "warning" | "error";
  message: string | null;
};

// ── Comments ───────────────────────────────────────────────────────────────

export type CommentContext = {
  id: string;
  companyId: string | null;
  pnlLineCode: string | null;
  body: string;
  createdAt: string;
  source: string; // "manual" | "ai"
};

// ── Period close ──────────────────────────────────────────────────────────

export type PeriodCloseContext = {
  companyId: string;
  companyName: string;
  periodMonth: string;
  status: string; // "open" | "in_review" | "closed"
  closedBy: string | null;
  closedAt: string | null;
};

// ── dbt freshness ─────────────────────────────────────────────────────────

export type DbtFreshnessContext = {
  status: string;
  triggeredAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  ageMinutes: number | null; // minutes since completedAt
};

// ── AI analysis response ──────────────────────────────────────────────────

export type AiFinding = {
  category: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
};

export type AiAction = {
  priority: "high" | "medium" | "low";
  action: string;
  owner?: string;
};

export type PeriodSummaryResponse = {
  headline: string;
  executiveSummary: string;
  findings: AiFinding[];
  risks: AiFinding[];
  recommendedActions: AiAction[];
  dataQualityCaveats: string[];
  periodLabel: string;
  modelName: string;
  promptVersion: string;
  generatedAt: string;
};

// ── Explain This response ─────────────────────────────────────────────────

export type ExplainKeyNumber = {
  label: string;
  value: string;
  change?: string;
};

export type ExplainDriver = {
  label: string;
  detail: string;
  direction: "positive" | "negative" | "neutral";
};

export type ExplanationResponse = {
  title: string;
  explanation: string;
  keyNumbers: ExplainKeyNumber[];
  drivers: ExplainDriver[];
  caveats: string[];
  modelName: string;
  promptVersion: string;
  generatedAt: string;
};

// ── Full context pack ─────────────────────────────────────────────────────

export type FinancialContextPack = {
  scope: FinancialContextScope;
  kpis: KpiSummary[];
  bullets: BulletKpiContext[];
  topDriversBudget: VarianceDriverContext[]; // top 10 pos + top 10 neg vs budget
  topDriversLy: VarianceDriverContext[];     // top 10 pos + top 10 neg vs LY
  dataQuality: DataQualityItem[];            // only warning/error items
  comments: CommentContext[];
  periodCloses: PeriodCloseContext[];
  dbtFreshness: DbtFreshnessContext | null;
  generatedAt: string; // ISO timestamp
};
