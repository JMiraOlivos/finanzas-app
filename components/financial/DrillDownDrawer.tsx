"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatPeriodMonth } from "@/lib/formatters";

type Account = {
  accountCode: string;
  accountName: string | null;
  amount: number;
  movementCount: number;
};

type Movement = {
  journalEntryId: string;
  entryDate: string;
  accountCode: string;
  accountName: string | null;
  description: string | null;
  documentNumber: string | null;
  debit: number;
  credit: number;
  pnlAmount: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  period: string;
  pnlLineCode: string;
  pnlLineLabel: string;
  viewMode?: "ytd" | "month";
};

export function DrillDownDrawer({
  open,
  onClose,
  companyId,
  companyName,
  period,
  pnlLineCode,
  pnlLineLabel,
  viewMode = "ytd",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !companyId || !period || !pnlLineCode) return;

    setLoading(true);
    setError(null);
    setAccounts([]);
    setMovements([]);
    setSelectedAccount(null);

    fetch(
      `/api/drilldown?companyId=${encodeURIComponent(companyId)}&period=${encodeURIComponent(period)}&pnlLineCode=${encodeURIComponent(pnlLineCode)}&viewMode=${viewMode}`
    )
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json() as Promise<{ accounts: Account[]; movements: Movement[] }>;
      })
      .then((data) => {
        setAccounts(data.accounts);
        setMovements(data.movements);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, companyId, period, pnlLineCode, viewMode]);

  const visibleMovements = selectedAccount
    ? movements.filter((m) => m.accountCode === selectedAccount)
    : movements;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 flex flex-col w-full max-w-3xl bg-white shadow-2xl border-l overflow-hidden">
        {/* Header */}
        <div className="border-b px-5 py-4 flex items-start justify-between shrink-0">
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">{companyName} · {viewMode === "ytd" ? `YTD ${formatPeriodMonth(period)}` : formatPeriodMonth(period)}</p>
            <h2 className="text-base font-semibold text-neutral-900">{pnlLineLabel}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 text-xl leading-none mt-0.5"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center flex-1 text-sm text-neutral-400">
            Cargando movimientos…
          </div>
        )}

        {error && (
          <div className="m-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Account summary */}
            <div className="border-b px-5 py-3 shrink-0">
              <p className="text-xs font-semibold text-neutral-500 mb-2">Cuentas contables</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedAccount(null)}
                  className={[
                    "text-xs px-2 py-1 rounded border",
                    !selectedAccount ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50",
                  ].join(" ")}
                >
                  Todas ({movements.length})
                </button>
                {accounts.map((a) => (
                  <button
                    key={a.accountCode}
                    onClick={() => setSelectedAccount(selectedAccount === a.accountCode ? null : a.accountCode)}
                    className={[
                      "text-xs px-2 py-1 rounded border",
                      selectedAccount === a.accountCode ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50",
                    ].join(" ")}
                    title={a.accountName ?? a.accountCode}
                  >
                    {a.accountCode} · {formatCurrency(a.amount)}
                  </button>
                ))}
              </div>
            </div>

            {/* Movements table */}
            <div className="flex-1 overflow-auto">
              <table className="min-w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-neutral-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-neutral-500">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium text-neutral-500">Cuenta</th>
                    <th className="px-3 py-2 text-left font-medium text-neutral-500">Glosa</th>
                    <th className="px-3 py-2 text-right font-medium text-neutral-500 tabular-nums">Debe</th>
                    <th className="px-3 py-2 text-right font-medium text-neutral-500 tabular-nums">Haber</th>
                    <th className="px-3 py-2 text-right font-medium text-neutral-500 tabular-nums">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMovements.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-neutral-400">
                        Sin movimientos para esta selección.
                      </td>
                    </tr>
                  )}
                  {visibleMovements.map((m) => (
                    <tr key={m.journalEntryId} className="border-b hover:bg-neutral-50">
                      <td className="px-3 py-1.5 whitespace-nowrap text-neutral-600">
                        {m.entryDate ? m.entryDate.slice(0, 10) : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="font-mono text-neutral-700">{m.accountCode}</span>
                        {m.accountName && (
                          <span className="ml-1 text-neutral-400">{m.accountName}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 max-w-[200px] truncate text-neutral-600" title={m.description ?? ""}>
                        {m.description ?? "—"}
                      </td>
                      <td className={["px-3 py-1.5 text-right tabular-nums", m.debit > 0 ? "text-red-600" : "text-neutral-400"].join(" ")}>
                        {m.debit ? formatCurrency(m.debit) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {m.credit ? formatCurrency(m.credit) : "—"}
                      </td>
                      <td className={["px-3 py-1.5 text-right tabular-nums font-medium", m.pnlAmount < 0 ? "text-red-600" : ""].join(" ")}>
                        {formatCurrency(m.pnlAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {visibleMovements.length > 0 && (
                  <tfoot className="sticky bottom-0 bg-neutral-50 border-t-2">
                    <tr>
                      <td colSpan={5} className="px-3 py-2 font-semibold text-right text-neutral-700">Total</td>
                      <td className={["px-3 py-2 text-right tabular-nums font-semibold", visibleMovements.reduce((s, m) => s + m.pnlAmount, 0) < 0 ? "text-red-600" : ""].join(" ")}>
                        {formatCurrency(visibleMovements.reduce((s, m) => s + m.pnlAmount, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
