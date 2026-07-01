"use client";

import { useState } from "react";
import { FinancialColumnGroup, FinancialRow } from "@/lib/eerr";
import { formatFinancialValue } from "@/lib/formatters";

const EXPENSE_CODES = new Set([
  "GASTOS_VARIABLES", "RRHH", "MARKETING", "GASTOS_ADMIN",
  "ASESORIAS", "GASTOS_OFICINA", "TECNOLOGIA", "NO_OPERACIONALES",
  "INTERESES_DEPR", "IMPUESTO",
]);

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
      <div className="flex items-center justify-center h-64 text-sm text-ev-gray4">
        Cargando datos…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-ev-gray4">
        No hay datos para el período seleccionado.
      </div>
    );
  }

  return (
    <section className="border border-ev-gray7 bg-white overflow-hidden">
      {(title || periodLabel) && (
        <div className="border-b border-ev-gray7 px-4 py-3 flex items-baseline gap-3">
          {title && <h2 className="text-sm font-head text-ev-black">{title}</h2>}
          {periodLabel && <span className="text-xs font-body text-ev-gray3 uppercase tracking-[0.08em]">{periodLabel}</span>}
        </div>
      )}

      <div className="overflow-auto">
        <table className="min-w-full border-collapse text-xs financial-table">
          <thead className="sticky top-0 z-20">
            {/* Row 1: company groups */}
            <tr className="bg-ev-beige2 border-b border-ev-gray7">
              <th
                rowSpan={2}
                className="sticky left-0 z-30 min-w-[260px] max-w-[320px] border-b border-r border-ev-gray7 bg-ev-beige2 px-3 py-2 text-left font-body font-semibold text-ev-gray2"
              >
                Sección PnL
              </th>
              {columnGroups.map((group) => (
                <th
                  key={group.id}
                  colSpan={group.columns.length}
                  className="border-b border-r border-ev-gray7 px-3 py-2 text-center font-body font-semibold text-ev-gray2 whitespace-nowrap"
                >
                  {group.label}
                </th>
              ))}
            </tr>

            {/* Row 2: column labels */}
            <tr className="bg-ev-beige2 border-b border-ev-gray7">
              {flatColumns.map((col) => (
                <th
                  key={col.id}
                  className="min-w-[110px] border-b border-r border-ev-gray7 px-3 py-1.5 text-right font-body font-medium text-ev-gray3 whitespace-nowrap"
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
                    "border-b border-ev-gray7",
                    row.isHighlighted ? "bg-ev-beige1" : "hover:bg-ev-beige2",
                    row.lineType === "calculated" ? "border-t-2 border-t-ev-black" : "",
                  ].join(" ")}
                >
                  {/* Label cell (sticky) */}
                  <td
                    className={[
                      "sticky left-0 z-10 border-r border-ev-gray7 px-3 py-1.5 text-left bg-white",
                      row.isHighlighted ? "bg-ev-beige1" : "",
                      row.isBold ? "font-semibold" : "",
                    ].join(" ")}
                    style={{ paddingLeft: `${12 + row.level * 18}px` }}
                  >
                    <span className="flex items-center gap-1">
                      {isCollapsible && (
                        <button
                          onClick={() => toggle(row.code)}
                          className="text-ev-gray4 hover:text-ev-black w-3 shrink-0"
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
                    const isExpenseRow =
                      EXPENSE_CODES.has(row.code) ||
                      EXPENSE_CODES.has(row.parentCode ?? "");
                    // Expense rows → red when non-zero; calculated rows → red only when negative
                    const isRed =
                      typeof value === "number" && value !== 0 &&
                      (isExpenseRow || (row.lineType === "calculated" && value < 0));
                    const clickable = !!onCellClick && row.lineType !== "calculated";

                    return (
                      <td
                        key={`${row.code}|${col.id}`}
                        className={[
                          "border-r border-ev-gray7 px-3 py-1.5 text-right tabular-nums whitespace-nowrap",
                          row.isBold ? "font-semibold" : "",
                          isRed ? "text-ev-red" : "",
                          clickable ? "cursor-pointer hover:bg-yellow-50" : "",
                        ].join(" ")}
                        onClick={() => {
                          if (!clickable) return;
                          onCellClick?.({ row, companyId: col.groupId, columnId: col.id });
                        }}
                      >
                        {value !== null ? formatFinancialValue(value, col.type) : (
                          <span className="text-ev-gray7">—</span>
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
