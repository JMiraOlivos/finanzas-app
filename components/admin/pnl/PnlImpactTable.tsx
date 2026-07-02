"use client";

type PnlLine = {
  pnlLineCode:  string;
  pnlLineLabel: string;
  lineType:     string;
  sortOrder:    number;
  parentCode:   string | null;
  level:        number;
  amountYtd:    number | null;
};

type Props = {
  period:        string;
  draftVersion:  { id: string; name: string; status: string };
  activeVersion: { id: string; name: string } | null;
  draft:         PnlLine[];
  active:        PnlLine[] | null;
};

function fmtAmount(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("es-CL", {
    style:                 "currency",
    currency:              "CLP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPeriod(iso: string): string {
  const [y, m] = iso.split("-");
  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `YTD ${months[Number(m) - 1]} ${y}`;
}

function diffColor(diff: number): string {
  if (diff === 0) return "text-ev-gray4";
  return diff > 0 ? "text-ev-green" : "text-ev-red";
}

export function PnlImpactTable({ period, draftVersion, activeVersion, draft, active }: Props) {
  const hasComparison = !!active && !!activeVersion;

  // Map from active rows for O(1) lookup
  const activeMap = new Map<string, number | null>(
    (active ?? []).map((r) => [r.pnlLineCode, r.amountYtd])
  );

  // Lines that exist in active but not in draft (removed lines)
  const draftCodes = new Set(draft.map((r) => r.pnlLineCode));
  const removedLines = (active ?? []).filter((r) => !draftCodes.has(r.pnlLineCode));

  const periodLabel = fmtPeriod(period);

  return (
    <div className="space-y-3">
      {/* Summary row */}
      <div className="flex items-center justify-between text-xs font-body text-ev-gray3 flex-wrap gap-2">
        <span>
          Período: <strong className="text-ev-black">{periodLabel}</strong>
        </span>
        {hasComparison ? (
          <span className="text-amber-700 border border-amber-200 bg-amber-50 px-2 py-0.5">
            Comparando <strong>{draftVersion.name}</strong> vs activa <strong>{activeVersion!.name}</strong>
          </span>
        ) : (
          <span className="text-ev-gray4">Sin versión activa publicada — mostrando solo el borrador</span>
        )}
      </div>

      <div className="border border-ev-gray7 bg-white overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead className="bg-ev-beige2">
            <tr>
              <th className="px-4 py-2.5 text-left text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">
                Línea P&L
              </th>
              <th className="px-3 py-2.5 text-right text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 whitespace-nowrap">
                <span className="block">{draftVersion.name}</span>
                <span className="text-[9px] normal-case tracking-normal text-ev-gray4 font-normal">Borrador</span>
              </th>
              {hasComparison && (
                <>
                  <th className="px-3 py-2.5 text-right text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 whitespace-nowrap">
                    <span className="block">{activeVersion!.name}</span>
                    <span className="text-[9px] normal-case tracking-normal text-ev-gray4 font-normal">Activa</span>
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 whitespace-nowrap">
                    Diferencia
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {draft.map((row) => {
              const isStructural = row.lineType !== "detail";
              const activeAmt    = activeMap.get(row.pnlLineCode);
              const hasAmount    = row.amountYtd !== null;
              const isNew        = hasComparison && activeAmt === undefined;

              return (
                <tr
                  key={row.pnlLineCode}
                  className={[
                    "border-t border-ev-gray7",
                    isStructural ? "bg-ev-beige2" : "hover:bg-neutral-50",
                  ].join(" ")}
                >
                  <td
                    className="px-4 py-2 text-xs font-body text-ev-black"
                    style={{ paddingLeft: `${(row.level - 1) * 20 + 16}px` }}
                  >
                    <span className="font-mono text-[10px] text-ev-gray5 mr-2">{row.pnlLineCode}</span>
                    <span className={isStructural ? "font-semibold" : ""}>{row.pnlLineLabel}</span>
                    {row.lineType === "subtotal" && !hasAmount && (
                      <span className="ml-2 text-[10px] text-ev-gray4 italic">subtotal — calculado en dbt</span>
                    )}
                    {isNew && (
                      <span className="ml-2 text-[10px] border border-ev-green text-ev-green px-1">nueva</span>
                    )}
                  </td>

                  {/* Draft amount */}
                  <td className={`px-3 py-2 text-xs font-body tabular-nums text-right ${isStructural ? "font-semibold text-ev-black" : "text-ev-black"}`}>
                    {hasAmount ? fmtAmount(row.amountYtd) : "—"}
                  </td>

                  {/* Active amount + diff */}
                  {hasComparison && (
                    <>
                      <td className="px-3 py-2 text-xs font-body tabular-nums text-right text-ev-gray3">
                        {activeAmt !== undefined
                          ? (activeAmt !== null ? fmtAmount(activeAmt) : "—")
                          : <span className="italic text-ev-gray5">—</span>
                        }
                      </td>
                      <td className={`px-3 py-2 text-xs font-body tabular-nums text-right ${
                        !hasAmount || activeAmt === undefined || activeAmt === null
                          ? "text-ev-gray4"
                          : diffColor((row.amountYtd ?? 0) - activeAmt)
                      }`}>
                        {hasAmount && activeAmt !== undefined && activeAmt !== null ? (() => {
                          const diff = (row.amountYtd ?? 0) - activeAmt;
                          const pct  = activeAmt !== 0 ? (diff / Math.abs(activeAmt)) * 100 : null;
                          if (diff === 0) return "—";
                          return (
                            <>
                              {diff > 0 ? "+" : ""}{fmtAmount(diff)}
                              {pct !== null && (
                                <span className="ml-1 text-[10px] opacity-70">
                                  ({pct > 0 ? "+" : ""}{pct.toFixed(1)}%)
                                </span>
                              )}
                            </>
                          );
                        })() : "—"}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}

            {/* Lines removed in this draft (exist in active but not draft) */}
            {hasComparison && removedLines.map((row) => (
              <tr key={`removed-${row.pnlLineCode}`} className="border-t border-ev-gray7 bg-red-50">
                <td
                  className="px-4 py-2 text-xs font-body text-ev-gray4"
                  style={{ paddingLeft: `${(row.level - 1) * 20 + 16}px` }}
                >
                  <span className="font-mono text-[10px] mr-2">{row.pnlLineCode}</span>
                  <span className="line-through">{row.pnlLineLabel}</span>
                  <span className="ml-2 text-[10px] text-red-500 no-underline">eliminada en borrador</span>
                </td>
                <td className="px-3 py-2 text-xs font-body tabular-nums text-right text-red-400 italic">
                  —
                </td>
                <td className="px-3 py-2 text-xs font-body tabular-nums text-right text-ev-gray3">
                  {fmtAmount(row.amountYtd)}
                </td>
                <td className="px-3 py-2 text-xs font-body tabular-nums text-right text-ev-red">
                  {row.amountYtd !== null && row.amountYtd !== 0
                    ? `${row.amountYtd > 0 ? "-" : "+"}${fmtAmount(Math.abs(row.amountYtd))}`
                    : "—"
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] font-body text-ev-gray4">
        * Líneas tipo subtotal no se computan en el preview — sus montos se calculan a través de dbt tras publicar.
        Los montos de tipo calculado usan los componentes de fórmula definidos en la pestaña Fórmulas.
      </p>
    </div>
  );
}
