"use client";

import { useState } from "react";
import { PnlImpactTable } from "./PnlImpactTable";

type PnlLine = {
  pnlLineCode:  string;
  pnlLineLabel: string;
  lineType:     string;
  sortOrder:    number;
  parentCode:   string | null;
  level:        number;
  amountYtd:    number | null;
};

type PreviewData = {
  period:        string;
  draftVersion:  { id: string; name: string; status: string };
  activeVersion: { id: string; name: string } | null;
  draft:         PnlLine[];
  active:        PnlLine[] | null;
};

type Version = { id: string; name: string; status: string };

type Props = {
  version: Version;
};

function defaultPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function PnlPreviewPanel({ version }: Props) {
  const [period,  setPeriod]  = useState(defaultPeriod);
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState<PreviewData | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setData(null);

    const res = await fetch(
      `/api/admin/pnl/versions/${version.id}/preview?period=${period}`
    );

    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setError(d.error ?? "Error al generar preview");
    } else {
      setData(await res.json() as PreviewData);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-5">
      <div className="border border-ev-gray7 bg-ev-beige2 px-4 py-3 text-xs font-body text-ev-gray3">
        El preview calcula los montos YTD usando la <strong>lógica de mapeo de este borrador</strong> y los compara
        contra la versión activa publicada (si existe), sin necesidad de publicar ni correr dbt.
        Las líneas tipo subtotal se muestran sin monto — se calculan en dbt al publicar.
      </div>

      {/* Period selector */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 block mb-1">
            Período acumulado a
          </label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border border-ev-gray6 px-3 py-1.5 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ev-black"
          />
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="px-5 py-1.5 text-xs font-body bg-ev-black text-white hover:bg-ev-gray2 disabled:opacity-40 transition-colors"
        >
          {loading ? "Calculando..." : "Generar preview"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="border border-red-300 bg-red-50 px-4 py-3 text-xs font-body text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 py-10 text-sm font-body text-ev-gray3">
          <div className="w-4 h-4 border-2 border-ev-gray6 border-t-ev-black rounded-full animate-spin shrink-0" />
          Calculando impacto YTD — puede tomar unos segundos...
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <PnlImpactTable
          period={data.period}
          draftVersion={data.draftVersion}
          activeVersion={data.activeVersion}
          draft={data.draft}
          active={data.active}
        />
      )}
    </div>
  );
}
