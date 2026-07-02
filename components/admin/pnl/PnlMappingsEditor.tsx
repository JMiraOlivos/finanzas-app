"use client";

import { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "@/lib/formatters";

type UnmappedAccount = {
  companyId: string;
  companyName: string;
  accountCode: string;
  accountName: string | null;
  movementCount: number;
  totalAmount: number;
};

type ExistingMapping = {
  id: string;
  companyId: string | null;
  companyName: string | null;
  accountCode: string;
  accountName: string | null;
  pnlLineCode: string;
  signMultiplier: number;
  isActive: boolean;
};

type PnlLine = {
  id: string;
  code: string;
  label: string;
  level: number;
  lineType: string;
  isActive: boolean;
};

type Version = {
  id: string;
  name: string;
  status: string;
};

type Props = { version: Version };

type Tab = "unmapped" | "existing";

export function PnlMappingsEditor({ version }: Props) {
  const [tab,       setTab]       = useState<Tab>("unmapped");
  const [unmapped,  setUnmapped]  = useState<UnmappedAccount[]>([]);
  const [mappings,  setMappings]  = useState<ExistingMapping[]>([]);
  const [lines,     setLines]     = useState<PnlLine[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [saving,    setSaving]    = useState<Record<string, boolean>>({});
  const [saved,     setSaved]     = useState<Record<string, boolean>>({});
  const [errors,    setErrors]    = useState<Record<string, string>>({});
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const isDraft = version.status === "draft";

  const load = useCallback(async () => {
    setLoading(true);
    setGlobalError(null);
    const [unmappedRes, mappingsRes, linesRes] = await Promise.all([
      fetch(`/api/admin/pnl/versions/${version.id}/mappings?unmapped=1`),
      fetch(`/api/admin/pnl/versions/${version.id}/mappings`),
      fetch(`/api/admin/pnl/versions/${version.id}/lines`),
    ]);
    if (!unmappedRes.ok || !mappingsRes.ok || !linesRes.ok) {
      setGlobalError("Error cargando datos"); setLoading(false); return;
    }
    const [u, m, l] = await Promise.all([
      unmappedRes.json() as Promise<UnmappedAccount[]>,
      mappingsRes.json() as Promise<ExistingMapping[]>,
      linesRes.json() as Promise<PnlLine[]>,
    ]);
    setUnmapped(u);
    setMappings(m);
    setLines(l);
    setSaved({});
    setSelections({});
    setLoading(false);
  }, [version.id]);

  useEffect(() => { void load(); }, [load]);

  const detailLines = lines.filter((l) => l.lineType === "detail" && l.isActive !== false);

  function uKey(a: UnmappedAccount) { return `${a.companyId}|${a.accountCode}`; }

  async function saveOne(account: UnmappedAccount) {
    const k = uKey(account);
    const pnlLineCode = selections[k];
    if (!pnlLineCode) return;
    setSaving((p) => ({ ...p, [k]: true }));
    setErrors((p) => ({ ...p, [k]: "" }));

    const res = await fetch(`/api/admin/pnl/versions/${version.id}/mappings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId:   account.companyId,
        accountCode: account.accountCode,
        accountName: account.accountName,
        pnlLineCode,
      }),
    });
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setErrors((p) => ({ ...p, [k]: d.error ?? "Error al guardar" }));
    } else {
      setSaved((p) => ({ ...p, [k]: true }));
      // Reload mappings count but keep unmapped list visual until full reload
      setTimeout(() => void load(), 800);
    }
    setSaving((p) => ({ ...p, [k]: false }));
  }

  async function deleteMapping(mappingId: string) {
    if (!confirm("¿Desactivar este mapping?")) return;
    setDeleting(mappingId);
    const res = await fetch(`/api/admin/pnl/versions/${version.id}/mappings/${mappingId}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setGlobalError(d.error ?? "Error al desactivar");
    } else {
      await load();
    }
    setDeleting(null);
  }

  const activeMappings = mappings.filter((m) => m.isActive);

  return (
    <div className="space-y-4">
      {isDraft && (
        <div className="border border-amber-400 bg-amber-50 px-4 py-2.5">
          <span className="text-amber-700 text-xs font-body">
            Estás editando un borrador — los mappings aquí no afectan reportes hasta publicar esta versión.
          </span>
        </div>
      )}

      {globalError && <p className="text-xs font-body text-red-600">{globalError}</p>}

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-ev-gray7">
        <button
          onClick={() => setTab("unmapped")}
          className={[
            "px-4 py-2 text-xs font-body uppercase tracking-[0.1em] border-b-2 transition-colors",
            tab === "unmapped" ? "border-ev-black text-ev-black" : "border-transparent text-ev-gray4 hover:text-ev-black",
          ].join(" ")}
        >
          Sin mapear {!loading && <span className="ml-1 text-ev-gray4">({unmapped.length})</span>}
        </button>
        <button
          onClick={() => setTab("existing")}
          className={[
            "px-4 py-2 text-xs font-body uppercase tracking-[0.1em] border-b-2 transition-colors",
            tab === "existing" ? "border-ev-black text-ev-black" : "border-transparent text-ev-gray4 hover:text-ev-black",
          ].join(" ")}
        >
          Mappings activos {!loading && <span className="ml-1 text-ev-gray4">({activeMappings.length})</span>}
        </button>
      </div>

      {/* Tab: Sin mapear */}
      {tab === "unmapped" && (
        <div className="border border-ev-gray7 bg-white overflow-hidden">
          <table className="min-w-full text-sm border-collapse">
            <thead className="bg-ev-beige2">
              <tr>
                {["Empresa", "Cuenta", "Monto", "Mov.", "Línea P&L", isDraft ? "" : undefined]
                  .filter(Boolean)
                  .map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-ev-gray7">
                  <td colSpan={6} className="px-3 py-3">
                    <div className="h-3.5 bg-neutral-100 animate-pulse rounded" />
                  </td>
                </tr>
              ))}
              {!loading && unmapped.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm font-body text-ev-gray3">
                    Todas las cuentas P&L están mapeadas en esta versión.
                  </td>
                </tr>
              )}
              {!loading && unmapped.map((a) => {
                const k = uKey(a);
                const isSaved = saved[k];
                return (
                  <tr key={k} className={["border-t border-ev-gray7", isSaved ? "bg-green-50" : "hover:bg-ev-beige2"].join(" ")}>
                    <td className="px-3 py-2.5 text-xs font-body text-ev-gray3 whitespace-nowrap">{a.companyName}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs text-ev-black">{a.accountCode}</span>
                      {a.accountName && <span className="ml-2 text-[11px] font-body text-ev-gray4">{a.accountName}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-body tabular-nums text-right whitespace-nowrap text-ev-gray2">
                      {formatCurrency(a.totalAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-body text-ev-gray4 text-right">{a.movementCount}</td>
                    <td className="px-3 py-2.5 min-w-[220px]">
                      {isSaved ? (
                        <span className="text-xs font-body text-ev-green">✓ Guardado</span>
                      ) : isDraft ? (
                        <select
                          value={selections[k] ?? ""}
                          onChange={(e) => setSelections((p) => ({ ...p, [k]: e.target.value }))}
                          className="w-full border border-ev-gray6 px-2 py-1 text-xs font-body focus:outline-none focus:ring-1 focus:ring-ev-black bg-white"
                        >
                          <option value="">Seleccionar línea…</option>
                          {detailLines.map((l) => (
                            <option key={l.code} value={l.code}>
                              {"  ".repeat(l.level - 1)}{l.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-body text-ev-gray4">Sin mapear</span>
                      )}
                      {errors[k] && <p className="text-[11px] font-body text-red-600 mt-0.5">{errors[k]}</p>}
                    </td>
                    {isDraft && (
                      <td className="px-3 py-2.5">
                        {!isSaved && (
                          <button
                            onClick={() => saveOne(a)}
                            disabled={!selections[k] || saving[k]}
                            className="text-xs font-body px-3 py-1 bg-ev-black text-white hover:bg-ev-gray2 disabled:opacity-40 transition-colors"
                          >
                            {saving[k] ? "…" : "Guardar"}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Mappings activos */}
      {tab === "existing" && (
        <div className="border border-ev-gray7 bg-white overflow-hidden">
          <table className="min-w-full text-sm border-collapse">
            <thead className="bg-ev-beige2">
              <tr>
                {["Cuenta", "Empresa", "Línea P&L", "Signo", isDraft ? "" : undefined]
                  .filter(Boolean)
                  .map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-ev-gray7">
                  <td colSpan={5} className="px-3 py-3">
                    <div className="h-3.5 bg-neutral-100 animate-pulse rounded" />
                  </td>
                </tr>
              ))}
              {!loading && activeMappings.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm font-body text-ev-gray3">
                    Esta versión no tiene mappings aún.
                  </td>
                </tr>
              )}
              {!loading && activeMappings.map((m) => (
                <tr key={m.id} className="border-t border-ev-gray7 hover:bg-ev-beige2">
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs text-ev-black">{m.accountCode}</span>
                    {m.accountName && <span className="ml-2 text-[11px] font-body text-ev-gray4">{m.accountName}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-body text-ev-gray3">
                    {m.companyName ?? <span className="text-ev-gray5 italic">Global</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-body font-mono text-ev-black">{m.pnlLineCode}</td>
                  <td className="px-3 py-2.5 text-xs font-body text-ev-gray4">
                    {m.signMultiplier === 1 ? "+" : "−"}
                  </td>
                  {isDraft && (
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => deleteMapping(m.id)}
                        disabled={deleting === m.id}
                        className="text-xs font-body text-red-500 hover:text-red-700 disabled:opacity-40"
                      >
                        {deleting === m.id ? "..." : "Desactivar"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
