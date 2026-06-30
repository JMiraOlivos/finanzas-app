"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/formatters";

type UnmappedAccount = {
  company_id: string;
  company_name: string;
  account_code: string;
  account_name: string | null;
  movement_count: number;
  total_amount: number;
};

type PnlLine = {
  id: string;
  code: string;
  label: string;
  level: number;
  line_type: string;
};

type Props = {
  accounts: UnmappedAccount[];
  pnlLines: PnlLine[];
  onSaved?: () => void;
};

export function MappingTable({ accounts, pnlLines, onSaved }: Props) {
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // detail lines only for mapping (no subtotals, no calculated)
  const detailLines = pnlLines.filter((l) => l.line_type === "detail");

  function key(a: UnmappedAccount) {
    return `${a.company_id}|${a.account_code}`;
  }

  async function saveMapping(account: UnmappedAccount) {
    const k = key(account);
    const pnlLineId = mappings[k];
    if (!pnlLineId) return;

    setSaving((p) => ({ ...p, [k]: true }));
    setErrors((p) => ({ ...p, [k]: "" }));

    try {
      const res = await fetch("/api/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId:   account.company_id,
          accountCode: account.account_code,
          accountName: account.account_name,
          pnlLineId,
          signMultiplier: 1,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Error al guardar");
      }
      setSaved((p) => ({ ...p, [k]: true }));
      onSaved?.();
    } catch (err) {
      setErrors((p) => ({ ...p, [k]: (err as Error).message }));
    } finally {
      setSaving((p) => ({ ...p, [k]: false }));
    }
  }

  if (!accounts.length) {
    return (
      <div className="text-sm text-neutral-500 py-8 text-center">
        No hay cuentas P&L sin mapear. ¡Todo está al día!
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-neutral-50">
            <th className="px-3 py-2 text-left font-medium text-neutral-600">Empresa</th>
            <th className="px-3 py-2 text-left font-medium text-neutral-600">Cuenta</th>
            <th className="px-3 py-2 text-right font-medium text-neutral-600 tabular-nums">Monto</th>
            <th className="px-3 py-2 text-right font-medium text-neutral-600">Mov.</th>
            <th className="px-3 py-2 text-left font-medium text-neutral-600 min-w-[260px]">Línea PnL</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => {
            const k = key(a);
            const isSaved = saved[k];
            return (
              <tr key={k} className={["border-b", isSaved ? "bg-green-50" : "hover:bg-neutral-50"].join(" ")}>
                <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">{a.company_name}</td>
                <td className="px-3 py-2">
                  <span className="font-mono text-neutral-800">{a.account_code}</span>
                  {a.account_name && (
                    <span className="ml-2 text-neutral-400 text-xs">{a.account_name}</span>
                  )}
                </td>
                <td className={["px-3 py-2 text-right tabular-nums whitespace-nowrap", a.total_amount < 0 ? "text-red-600" : ""].join(" ")}>
                  {formatCurrency(a.total_amount)}
                </td>
                <td className="px-3 py-2 text-right text-neutral-400">{a.movement_count}</td>
                <td className="px-3 py-2">
                  {isSaved ? (
                    <span className="text-green-700 font-medium text-xs">✓ Guardado</span>
                  ) : (
                    <select
                      value={mappings[k] ?? ""}
                      onChange={(e) => setMappings((p) => ({ ...p, [k]: e.target.value }))}
                      className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-400"
                    >
                      <option value="">Seleccionar línea PnL…</option>
                      {detailLines.map((l) => (
                        <option key={l.id} value={l.id}>
                          {"  ".repeat(l.level)}{l.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {errors[k] && <p className="text-xs text-red-600 mt-0.5">{errors[k]}</p>}
                </td>
                <td className="px-3 py-2">
                  {!isSaved && (
                    <button
                      onClick={() => saveMapping(a)}
                      disabled={!mappings[k] || saving[k]}
                      className="text-xs px-3 py-1.5 rounded bg-neutral-900 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-700"
                    >
                      {saving[k] ? "…" : "Guardar"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
