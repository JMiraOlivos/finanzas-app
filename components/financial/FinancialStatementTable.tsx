"use client";

import { useState } from "react";
import { FinancialColumnGroup, FinancialRow } from "@/lib/eerr";
import { formatFinancialValue } from "@/lib/formatters";

type CellClickParams = {
  row: FinancialRow;
  companyId: string;
  columnId: string;
};

type Props = {
  title?: string;
  periodLabel?: string;
  columnGroups: FinancialColumnGroup[];
  rows: FinancialRow[];
  loading?: boolean;
  onCellClick?: (params: CellClickParams) => void;
};

export function FinancialStatementTable({
  title,
  periodLabel,
  columnGroups,
  rows,
  loading = false,
  onCellClick,
}: Props) {
  const [collapsedCodes, setCollapsedCodes] = useState<Set<string>>(new Set());

  const flatColumns = columnGroups.flatMap((group) =>
    group.columns.map((col) => ({ ...col, groupId: group.id, groupLabel: group.label }))
  );

  function toggle(code: string) {
    setCollapsedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  function isVisible(row: FinancialRow): boolean {
    if (!row.parentCode) return true;
    if (collapsedCodes.has(row.parentCode)) return false;
    return true;
  }

  const hasChildren = new Set(rows.map((r) => r.parentCode).filter(Boolean));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-neutral-400">
        Cargando datos…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-neutral-400">
        No hay datos para el período seleccionado.
      </div>
    );
  }

  return (
    <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
      {(title || periodLabel) && (
        <div className="border-b px-4 py-3 flex items-baseline gap-3">
          {title && <h2 className="text-base font-semibold text-neutral-900">{title}</h2>}
          {periodLabel && <span className="text-sm text-neutral-500">{periodLabel}</span>}
        </div>
      )}

      <div className="overflow-auto">
        <table className="min-w-full border-collapse text-xs financial-table">
          <thead className="sticky top-0 z-20">
            {/* Row 1: company groups */}
            <tr className="bg-neutral-50 border-b">
              <th
                rowSpan={2}
                className="sticky left-0 z-30 min-w-[260px] max-w-[320px] border-b border-r bg-neutral-50 px-3 py-2 text-left font-semibold text-neutral-700"
              >
                Sección PnL
              </th>
              {columnGroups.map((group) => (
                <th
                  key={group.id}
                  colSpan={group.columns.length}
                  className="border-b border-r px-3 py-2 text-center font-semibold text-neutral-700 whitespace-nowrap"
                >
                  {group.label}
                </th>
              ))}
            </tr>

            {/* Row 2: column labels */}
            <tr className="bg-neutral-50 border-b">
              {flatColumns.map((col) => (
                <th
                  key={col.id}
                  className="min-w-[110px] border-b border-r px-3 py-1.5 text-right font-medium text-neutral-500 whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.filter(isVisible).map((row) => {
              const isCollapsible = hasChildren.has(row.code);
              const isCollapsed = collapsedCodes.has(row.code);

              return (
                <tr
                  key={row.code}
                  className={[
                    "border-b",
                    row.isHighlighted ? "bg-neutral-100" : "hover:bg-neutral-50",
                    row.lineType === "calculated" ? "border-t-2 border-t-neutral-700" : "",
                  ].join(" ")}
                >
                  {/* Label cell (sticky) */}
                  <td
                    className={[
                      "sticky left-0 z-10 border-r px-3 py-1.5 text-left bg-white",
                      row.isHighlighted ? "bg-neutral-100" : "",
                      row.isBold ? "font-semibold" : "",
                    ].join(" ")}
                    style={{ paddingLeft: `${12 + row.level * 18}px` }}
                  >
                    <span className="flex items-center gap-1">
                      {isCollapsible && (
                        <button
                          onClick={() => toggle(row.code)}
                          className="text-neutral-400 hover:text-neutral-700 w-3 shrink-0"
                          aria-label={isCollapsed ? "Expandir" : "Colapsar"}
                        >
                          {isCollapsed ? "▶" : "▼"}
                        </button>
                      )}
                      {row.label}
                    </span>
                  </td>

                  {/* Value cells */}
                  {flatColumns.map((col) => {
                    const value = row.values[col.id] ?? null;
                    const isNegative = typeof value === "number" && value < 0;
                    const clickable = !!onCellClick && row.lineType !== "calculated";

                    return (
                      <td
                        key={`${row.code}|${col.id}`}
                        className={[
                          "border-r px-3 py-1.5 text-right tabular-nums whitespace-nowrap",
                          row.isBold ? "font-semibold" : "",
                          isNegative ? "text-red-600" : "",
                          clickable ? "cursor-pointer hover:bg-yellow-50" : "",
                        ].join(" ")}
                        onClick={() => {
                          if (!clickable) return;
                          onCellClick?.({ row, companyId: col.groupId, columnId: col.id });
                        }}
                      >
                        {value !== null ? formatFinancialValue(value, col.type) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
