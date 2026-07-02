"use client";

import { useState } from "react";
import { formatCurrencyUnit, formatPercentage, type CurrencyUnit } from "@/lib/formatters";

export type CompanyRankingRow = {
  companyId: string;
  companyName: string;
  revenue: number | null;
  ebitda: number | null;
  ebitdaMargin: number | null;
  resultado: number | null;
  revenueVsPriorPct: number | null;
  ebitdaVsPriorPct: number | null;
};

type SortKey = "revenue" | "ebitda" | "ebitdaMargin" | "resultado";

type Props = {
  rows: CompanyRankingRow[];
  loading?: boolean;
  unit?: CurrencyUnit;
  activeCompanyId?: string | null;
  onCompanyClick?: (companyId: string, companyName: string) => void;
};

function light(row: CompanyRankingRow): "green" | "yellow" | "red" {
  if (row.ebitda == null) return "yellow";
  if (row.ebitda < 0)    return "red";
  if ((row.ebitdaMargin ?? 0) < 0.05) return "yellow";
  return "green";
}

const LIGHT_CLS = { green: "bg-green-500", yellow: "bg-yellow-400", red: "bg-red-500" };

function DeltaBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-ev-gray4">—</span>;
  const pos = value >= 0;
  return (
    <span className={["tabular-nums text-xs font-body", pos ? "text-green-600" : "text-ev-red"].join(" ")}>
      {pos ? "▲" : "▼"} {formatPercentage(Math.abs(value))}
    </span>
  );
}

const COLS: { key: SortKey; label: string }[] = [
  { key: "revenue",      label: "Ingresos YTD" },
  { key: "ebitda",       label: "EBITDA YTD" },
  { key: "ebitdaMargin", label: "Margen EBITDA" },
  { key: "resultado",    label: "Resultado Final" },
];

export function CompanyRanking({ rows, loading, unit = "millions", activeCompanyId, onCompanyClick }: Props) {
  const [sort, setSort]   = useState<SortKey>("revenue");
  const [asc,  setAsc]    = useState(false);

  function toggleSort(key: SortKey) {
    if (sort === key) setAsc((a) => !a);
    else { setSort(key); setAsc(false); }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sort] ?? -Infinity;
    const bv = b[sort] ?? -Infinity;
    return asc ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
  });

  return (
    <div className="border border-ev-gray7 bg-white">
      <div className="px-5 py-3 border-b border-ev-gray7">
        <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">Ranking empresas</p>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead className="bg-ev-beige2">
            <tr>
              <th className="w-6 px-3 py-2" />
              <th className="px-4 py-2 text-left text-[10px] uppercase tracking-[0.1em] text-ev-gray3 font-body">Empresa</th>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className={[
                    "px-4 py-2 text-right text-[10px] uppercase tracking-[0.1em] font-body cursor-pointer select-none",
                    sort === c.key ? "text-ev-black" : "text-ev-gray3",
                    "hover:text-ev-black",
                  ].join(" ")}
                >
                  {c.label} {sort === c.key ? (asc ? "↑" : "↓") : ""}
                </th>
              ))}
              <th className="px-4 py-2 text-right text-[10px] uppercase tracking-[0.1em] text-ev-gray3 font-body">vs Año Ant.</th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-t border-ev-gray7">
                <td colSpan={7} className="px-4 py-3">
                  <div className="h-4 bg-neutral-100 animate-pulse rounded" />
                </td>
              </tr>
            ))}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-ev-gray3 text-sm font-body">
                  Sin datos para el período seleccionado
                </td>
              </tr>
            )}
            {!loading && sorted.map((row) => {
              const l = light(row);
              const isActive = activeCompanyId === row.companyId;
              return (
                <tr
                  key={row.companyId}
                  onClick={() => onCompanyClick?.(row.companyId, row.companyName)}
                  className={[
                    "border-t border-ev-gray7",
                    onCompanyClick ? "cursor-pointer" : "",
                    isActive ? "bg-ev-beige1" : "hover:bg-ev-beige2",
                  ].join(" ")}
                >
                  <td className="px-3 py-2.5">
                    <span className={["inline-block w-2 h-2 rounded-full", LIGHT_CLS[l]].join(" ")} />
                  </td>
                  <td className="px-4 py-2.5 font-body font-medium text-ev-black whitespace-nowrap">
                    {row.companyName}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-body text-ev-black">
                    {row.revenue != null ? formatCurrencyUnit(row.revenue, unit) : "—"}
                  </td>
                  <td className={["px-4 py-2.5 text-right tabular-nums font-body", (row.ebitda ?? 0) < 0 ? "text-ev-red" : "text-ev-black"].join(" ")}>
                    {row.ebitda != null ? formatCurrencyUnit(row.ebitda, unit) : "—"}
                  </td>
                  <td className={["px-4 py-2.5 text-right tabular-nums font-body", (row.ebitdaMargin ?? 0) < 0 ? "text-ev-red" : "text-ev-black"].join(" ")}>
                    {row.ebitdaMargin != null ? formatPercentage(row.ebitdaMargin) : "—"}
                  </td>
                  <td className={["px-4 py-2.5 text-right tabular-nums font-body", (row.resultado ?? 0) < 0 ? "text-ev-red" : "text-ev-black"].join(" ")}>
                    {row.resultado != null ? formatCurrencyUnit(row.resultado, unit) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DeltaBadge value={row.revenueVsPriorPct} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
