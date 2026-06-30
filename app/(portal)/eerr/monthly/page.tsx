"use client";

import { useEffect, useState, useCallback } from "react";
import { FinancialStatementTable } from "@/components/financial/FinancialStatementTable";
import { FinancialStatementPayload } from "@/lib/eerr";

type Company = { id: string; name: string };

export default function EerrMonthlyPage() {
  const [companies,   setCompanies]   = useState<Company[]>([]);
  const [selectedId,  setSelectedId]  = useState<string>("");
  const [year,        setYear]        = useState(String(new Date().getFullYear()));
  const [payload,     setPayload]     = useState<FinancialStatementPayload | null>(null);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json() as Promise<Company[]>)
      .then((data) => {
        setCompanies(data);
        if (data.length) setSelectedId(data[0].id);
      });
  }, []);

  const loadData = useCallback(() => {
    if (!selectedId) return;
    setLoading(true);
    fetch(`/api/eerr/monthly?year=${year}&companyIds=${selectedId}`)
      .then((r) => r.json() as Promise<FinancialStatementPayload>)
      .then(setPayload)
      .finally(() => setLoading(false));
  }, [year, selectedId]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">EERR Mensual</h1>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        {/* Filters */}
        <div className="border-b px-4 py-3 flex items-center gap-4 bg-neutral-50">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-neutral-600">Empresa</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="text-xs border rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-neutral-600">Año</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="text-xs border rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
            >
              {[2023, 2024, 2025, 2026].map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <FinancialStatementTable
          title={payload?.title}
          columnGroups={payload?.columnGroups ?? []}
          rows={payload?.rows ?? []}
          loading={loading}
        />
      </div>
    </div>
  );
}
