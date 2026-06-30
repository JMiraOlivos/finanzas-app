"use client";

import { useEffect, useState, useCallback } from "react";
import { FinancialStatementTable } from "@/components/financial/FinancialStatementTable";
import { EerrFilters } from "@/components/financial/EerrFilters";
import { FinancialStatementPayload } from "@/lib/eerr";

type Company = { id: string; name: string };

function defaultPeriod() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDay = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getDate();
  return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-${lastDay}`;
}

export default function EerrLMonthPage() {
  const [companies,   setCompanies]   = useState<Company[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [period,      setPeriod]      = useState(defaultPeriod);
  const [payload,     setPayload]     = useState<FinancialStatementPayload | null>(null);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json() as Promise<Company[]>)
      .then((data) => { setCompanies(data); setSelectedIds(data.map((c) => c.id)); });
  }, []);

  const loadData = useCallback(() => {
    if (!selectedIds.length) { setPayload(null); return; }
    setLoading(true);
    const qs = new URLSearchParams({ period, mode: "lmonth", companyIds: selectedIds.join(",") });
    fetch(`/api/eerr?${qs}`)
      .then((r) => r.json() as Promise<FinancialStatementPayload>)
      .then(setPayload)
      .finally(() => setLoading(false));
  }, [period, selectedIds]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-neutral-900">EERR Mes + YTD</h1>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <EerrFilters
          companies={companies}
          selectedCompanyIds={selectedIds}
          onCompanyChange={setSelectedIds}
          period={period}
          onPeriodChange={setPeriod}
        />
        <FinancialStatementTable
          title={payload?.title}
          periodLabel={payload?.periodLabel}
          columnGroups={payload?.columnGroups ?? []}
          rows={payload?.rows ?? []}
          loading={loading}
        />
      </div>
    </div>
  );
}
