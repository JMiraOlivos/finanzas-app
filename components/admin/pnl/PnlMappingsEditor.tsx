"use client";

import { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "@/lib/formatters";
import { AiMappingSuggestionButton } from "./AiMappingSuggestionButton";
import { SearchableLineSelect } from "./SearchableLineSelect";

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
  const [tab,          setTab]          = useState<Tab>("unmapped");
  const [unmapped,     setUnmapped]     = useState<UnmappedAccount[]>([]);
  const [mappings,     setMappings]     = useState<ExistingMapping[]>([]);
  const [lines,        setLines]        = useState<PnlLine[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selections,   setSelections]   = useState<Record<string, string>>({});
  const [bulkSaving,   setBulkSaving]   = useState(false);
  const [bulkResult,   setBulkResult]   = useState<number | null>(null);
  const [remaps,       setRemaps]       = useState<Record<string, string>>({});  // mappingId → new pnlLineCode
  const [remapSaving,  setRemapSaving]  = useState(false);
  const [remapResult,  setRemapResult]  = useState<number | null>(null);
  const [deleting,     setDeleting]     = useState<string | null>(null);
  const [globalError,  setGlobalError]  = useState<string | null>(null);

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
    setSelections({});
    setRemaps({});
    setBulkResult(null);
    setRemapResult(null);
    setLoading(false);
  }, [version.id]);

  useEffect(() => { void load(); }, [load]);

  const detailLines = lines
    .filter((l) => l.lineType === "detail" && l.isActive !== false)
    .sort((a, b) => a.label.localeCompare(b.label, "es"));

  const lineOptions = detailLines.map((l) => ({ value: l.code, label: l.label }));

  function uKey(a: UnmappedAccount) { return `${a.companyId}|${a.accountCode}`; }

  const selectionCount = Object.values(selections).filter(Boolean).length;

  async function saveBulk() {
    const items = unmapped
      .filter((a) => selections[uKey(a)])
      .map((a) => ({
        companyId:   a.companyId,
        accountCode: a.accountCode,
        accountName: a.accountName,
        pnlLineCode: selections[uKey(a)],
      }));

    if (items.length === 0) return;

    setBulkSaving(true);
    setGlobalError(null);

    const res = await fetch(`/api/admin/pnl/versions/${version.id}/mappings/bulk`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(items),
    });

    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setGlobalError(d.error ?? "Error al guardar mappings");
      setBulkSaving(false);
    } else {
      const d = await res.json() as { inserted: number };
      setBulkResult(d.inserted);
      setBulkSaving(false);
      // Reload to reflect saved accounts in both tabs
      await load();
    }
  }

  const remapCount = Object.keys(remaps).length;

  async function saveRemaps() {
    const changed = activeMappings.filter((m) => remaps[m.id] && remaps[m.id] !== m.pnlLineCode);
    if (changed.length === 0) return;

    setRemapSaving(true);
    setGlobalError(null);

    const items = changed.map((m) => ({
      companyId:   m.companyId,
      accountCode: m.accountCode,
      accountName: m.accountName,
      pnlLineCode: remaps[m.id],
    }));

    const res = await fetch(`/api/admin/pnl/versions/${version.id}/mappings/bulk`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(items),
    });

    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setGlobalError(d.error ?? "Error al guardar cambios");
      setRemapSaving(false);
    } else {
      const d = await res.json() as { inserted: number };
      setRemapResult(d.inserted);
      setRemapSaving(false);
      await load();
    }
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
        <div className="space-y-2">
          {/* Bulk save toolbar */}
          {isDraft && !loading && unmapped.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs font-body text-ev-gray3">
                {selectionCount > 0
                  ? `${selectionCount} de ${unmapped.length} cuentas seleccionadas`
                  : `${unmapped.length} cuenta${unmapped.length !== 1 ? "s" : ""} sin mapear — usa los dropdowns y luego guarda`}
              </p>
              <div className="flex items-center gap-3">
                {bulkResult !== null && (
                  <span className="text-xs font-body text-ev-green">✓ {bulkResult} guardados</span>
                )}
                <button
                  onClick={saveBulk}
                  disabled={selectionCount === 0 || bulkSaving}
                  className="px-4 py-1.5 text-xs font-body bg-ev-black text-white hover:bg-ev-gray2 disabled:opacity-40 transition-colors"
                >
                  {bulkSaving ? "Guardando..." : `Guardar seleccionados (${selectionCount})`}
                </button>
              </div>
            </div>
          )}

          <div className="border border-ev-gray7 bg-white overflow-hidden">
            <table className="min-w-full text-sm border-collapse">
              <thead className="bg-ev-beige2">
                <tr>
                  {["Empresa", "Cuenta", "Monto", "Mov.", "Línea P&L"].map((h) => (
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
                {!loading && unmapped.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm font-body text-ev-gray3">
                      Todas las cuentas P&L están mapeadas en esta versión.
                    </td>
                  </tr>
                )}
                {!loading && unmapped.map((a) => {
                  const k = uKey(a);
                  const hasSelection = !!selections[k];
                  return (
                    <tr
                      key={k}
                      className={[
                        "border-t border-ev-gray7",
                        hasSelection ? "bg-blue-50" : "hover:bg-ev-beige2",
                      ].join(" ")}
                    >
                      <td className="px-3 py-2.5 text-xs font-body text-ev-gray3 whitespace-nowrap">{a.companyName}</td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-xs text-ev-black">{a.accountCode}</span>
                        {a.accountName && <span className="ml-2 text-[11px] font-body text-ev-gray4">{a.accountName}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-body tabular-nums text-right whitespace-nowrap text-ev-gray2">
                        {formatCurrency(a.totalAmount)}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-body text-ev-gray4 text-right">{a.movementCount}</td>
                      <td className="px-3 py-2.5 min-w-[240px]">
                        {isDraft ? (
                          <>
                            <SearchableLineSelect
                              value={selections[k] ?? ""}
                              onChange={(code) => setSelections((p) => ({ ...p, [k]: code }))}
                              options={lineOptions}
                            />
                            <AiMappingSuggestionButton
                              accountCode={a.accountCode}
                              accountName={a.accountName}
                              versionId={version.id}
                              onSuggest={(code) => setSelections((p) => ({ ...p, [k]: code }))}
                            />
                          </>
                        ) : (
                          <span className="text-xs font-body text-ev-gray4">Sin mapear</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Mappings activos */}
      {tab === "existing" && (
        <div className="space-y-2">
          {/* Remap toolbar */}
          {isDraft && !loading && activeMappings.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs font-body text-ev-gray3">
                {remapCount > 0
                  ? `${remapCount} mapping${remapCount !== 1 ? "s" : ""} con cambios pendientes`
                  : "Cambia la línea P&L de cualquier cuenta en el dropdown"}
              </p>
              <div className="flex items-center gap-3">
                {remapResult !== null && (
                  <span className="text-xs font-body text-ev-green">✓ {remapResult} actualizados</span>
                )}
                <button
                  onClick={saveRemaps}
                  disabled={remapCount === 0 || remapSaving}
                  className="px-4 py-1.5 text-xs font-body bg-ev-black text-white hover:bg-ev-gray2 disabled:opacity-40 transition-colors"
                >
                  {remapSaving ? "Guardando..." : `Guardar cambios (${remapCount})`}
                </button>
              </div>
            </div>
          )}

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
                {!loading && activeMappings.map((m) => {
                  const currentCode = remaps[m.id] ?? m.pnlLineCode;
                  const changed = remaps[m.id] && remaps[m.id] !== m.pnlLineCode;
                  return (
                    <tr
                      key={m.id}
                      className={[
                        "border-t border-ev-gray7",
                        changed ? "bg-blue-50" : "hover:bg-ev-beige2",
                      ].join(" ")}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-body text-xs text-ev-black">
                          {m.accountName ?? <span className="text-ev-gray4 italic">Sin nombre</span>}
                        </div>
                        <div className="font-mono text-[10px] text-ev-gray4">{m.accountCode}</div>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-body text-ev-gray3">
                        {m.companyName ?? <span className="text-ev-gray5 italic">Global</span>}
                      </td>
                      <td className="px-3 py-2.5 min-w-[200px]">
                        {isDraft ? (
                          <SearchableLineSelect
                            value={currentCode}
                            onChange={(val) => {
                              setRemaps((prev) => {
                                if (val === m.pnlLineCode) {
                                  const next = { ...prev };
                                  delete next[m.id];
                                  return next;
                                }
                                return { ...prev, [m.id]: val };
                              });
                            }}
                            options={lineOptions}
                          />
                        ) : (
                          <span className="font-mono text-xs text-ev-black">{m.pnlLineCode}</span>
                        )}
                      </td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
