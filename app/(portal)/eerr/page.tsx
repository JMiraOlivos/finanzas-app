"use client";

import { useEffect, useState, useCallback } from "react";
import { FinancialStatementTable } from "@/components/financial/FinancialStatementTable";
import { DrillDownDrawer } from "@/components/financial/DrillDownDrawer";
import { EerrFilters } from "@/components/financial/EerrFilters";
import { FinancialStatementPayload, FinancialRow } from "@/lib/eerr";
import { type EerrMode } from "@/components/financial/EerrFilters";

type Company = { id: string; name: string };

function defaultPeriod() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDay = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getDate();
  return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-${lastDay}`;
}

export default function EerrPage() {
  const [companies,    setCompanies]    = useState<Company[]>([]);
  const [selectedIds,  setSelectedIds]  = useState<string[]>([]);
  const [period,       setPeriod]       = useState(defaultPeriod);
  const [mode,         setMode]         = useState<EerrMode>("ytd");
  const [payload,      setPayload]      = useState<FinancialStatementPayload | null>(null);
  const [loading,      setLoading]      = useState(false);

  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [drawerParams, setDrawerParams] = useState<{
    companyId: string; companyName: string; pnlLineCode: string; pnlLineLabel: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json() as Promise<Company[]>)
      .then((data) => {
        setCompanies(data);
        setSelectedIds(data.map((c) => c.id));
      });
  }, []);

  const loadData = useCallback(() => {
    if (!selectedIds.length) { setPayload(null); return; }
    setLoading(true);
    const qs = new URLSearchParams({ period, mode, companyIds: selectedIds.join(",") });
    fetch(`/api/eerr?${qs}`)
      .then((r) => r.json() as Promise<FinancialStatementPayload>)
      .then(setPayload)
      .finally(() => setLoading(false));
  }, [period, mode, selectedIds]);

  useEffect(() => { loadData(); }, [loadData]);

  function handleCellClick(params: { row: FinancialRow; companyId: string }) {
    const company = companies.find((c) => c.id === params.companyId);
    if (!company) return;
    setDrawerParams({
      companyId:    params.companyId,
      companyName:  company.name,
      pnlLineCode:  params.row.code,
      pnlLineLabel: params.row.label,
    });
    setDrawerOpen(true);
  }

  function handleExcel() {
    const qs = new URLSearchParams({ period, mode, companyIds: selectedIds.join(","), format: "excel" });
    window.location.href = `/api/eerr?${qs}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-head text-ev-black">Estado de Resultados</h1>
        <button
          onClick={handleExcel}
          disabled={!payload?.rows.length}
          className="text-xs font-body px-3 py-1.5 border border-ev-gray6 text-ev-gray2
                     hover:bg-ev-beige2 disabled:opacity-40 transition-colors"
        >
          Exportar Excel
        </button>
      </div>

      <div className="border border-ev-gray7 bg-white overflow-hidden">
        <EerrFilters
          companies={companies}
          selectedCompanyIds={selectedIds}
          onCompanyChange={setSelectedIds}
          period={period}
          onPeriodChange={setPeriod}
          mode={mode}
          onModeChange={setMode}
        />

        <FinancialStatementTable
          title={payload?.title}
          periodLabel={payload?.periodLabel}
          columnGroups={payload?.columnGroups ?? []}
          rows={payload?.rows ?? []}
          loading={loading}
          onCellClick={(p) => handleCellClick({ row: p.row, companyId: p.companyId })}
        />
      </div>

      {drawerOpen && drawerParams && (
        <DrillDownDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          companyId={drawerParams.companyId}
          companyName={drawerParams.companyName}
          period={period}
          pnlLineCode={drawerParams.pnlLineCode}
          pnlLineLabel={drawerParams.pnlLineLabel}
          viewMode={mode === "lmonth" || mode === "vs_budget" ? "ytd" : mode}
        />
      )}
    </div>
  );
}
