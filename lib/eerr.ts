export type FinancialColumn = {
  id: string;
  label: string;
  type: "currency" | "percentage" | "number";
  isAggregate?: boolean;  // true for Total column — disables drilldown click
};

export type FinancialColumnGroup = {
  id: string;
  label: string;
  columns: FinancialColumn[];
};

export type FinancialRow = {
  code: string;
  label: string;
  parentCode: string | null;
  level: number;
  sortOrder: number;
  lineType: "detail" | "subtotal" | "calculated";
  isBold: boolean;
  isHighlighted: boolean;
  values: Record<string, number | null>;
};

export type FinancialStatementPayload = {
  title: string;
  periodLabel: string;
  columnGroups: FinancialColumnGroup[];
  rows: FinancialRow[];
};

export type DrillDownRow = {
  journalEntryId: string;
  entryDate: string;
  periodMonth: string;
  accountCode: string;
  accountName: string | null;
  description: string | null;
  documentNumber: string | null;
  debit: number;
  credit: number;
  pnlAmount: number;
  pnlLineCode: string;
  pnlLineLabel: string;
};

export type KpiMetric = {
  code: string;
  label: string;
  value: number | null;
  format: "currency" | "percentage" | "number";
};
