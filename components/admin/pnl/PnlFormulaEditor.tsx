"use client";

import { useState, useEffect, useCallback } from "react";

type FormulaComponent = {
  componentLineCode: string;
  operator: 1 | -1;
  sortOrder: number;
};

type Formula = {
  formulaKey: string;
  components: FormulaComponent[];
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

export function PnlFormulaEditor({ version }: Props) {
  const [formulas,      setFormulas]      = useState<Formula[]>([]);
  const [lines,         setLines]         = useState<PnlLine[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [selectedKey,   setSelectedKey]   = useState<string | null>(null);
  const [editComponents, setEditComponents] = useState<FormulaComponent[]>([]);
  const [newKey,        setNewKey]        = useState("");
  const [addingNew,     setAddingNew]     = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [saved,         setSaved]         = useState(false);

  const isDraft = version.status === "draft";

  const load = useCallback(async () => {
    setLoading(true);
    const [fRes, lRes] = await Promise.all([
      fetch(`/api/admin/pnl/versions/${version.id}/formulas`),
      fetch(`/api/admin/pnl/versions/${version.id}/lines`),
    ]);
    const [formulas, lines] = await Promise.all([
      fRes.json() as Promise<Formula[]>,
      lRes.json() as Promise<PnlLine[]>,
    ]);
    setFormulas(formulas);
    setLines(lines);
    setLoading(false);
  }, [version.id]);

  useEffect(() => { void load(); }, [load]);

  function selectFormula(key: string) {
    const f = formulas.find((f) => f.formulaKey === key);
    setSelectedKey(key);
    setEditComponents(f ? f.components.map((c) => ({ ...c })) : []);
    setSaved(false);
    setError(null);
    setAddingNew(false);
  }

  function addComponent() {
    const nextOrder = editComponents.length > 0
      ? Math.max(...editComponents.map((c) => c.sortOrder)) + 10
      : 10;
    setEditComponents((prev) => [...prev, { componentLineCode: "", operator: 1, sortOrder: nextOrder }]);
  }

  function removeComponent(idx: number) {
    setEditComponents((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateComponent(idx: number, patch: Partial<FormulaComponent>) {
    setEditComponents((prev) => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }

  async function saveFormula() {
    if (!selectedKey) return;
    const invalid = editComponents.some((c) => !c.componentLineCode.trim());
    if (invalid) { setError("Selecciona una línea para cada componente"); return; }

    setSaving(true); setError(null); setSaved(false);
    const res = await fetch(`/api/admin/pnl/versions/${version.id}/formulas/${selectedKey}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ components: editComponents }),
    });
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setError(d.error ?? "Error al guardar");
    } else {
      setSaved(true);
      await load();
    }
    setSaving(false);
  }

  async function deleteFormula() {
    if (!selectedKey || !confirm(`¿Eliminar fórmula "${selectedKey}" y todos sus componentes?`)) return;
    setDeleting(true); setError(null);
    const res = await fetch(`/api/admin/pnl/versions/${version.id}/formulas/${selectedKey}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setError(d.error ?? "Error al eliminar");
    } else {
      setSelectedKey(null);
      setEditComponents([]);
      await load();
    }
    setDeleting(false);
  }

  async function createFormula() {
    const key = newKey.trim().toUpperCase();
    if (!key) { setError("El nombre de la fórmula es requerido"); return; }
    if (formulas.some((f) => f.formulaKey === key)) { setError(`La fórmula "${key}" ya existe`); return; }
    setSaving(true); setError(null);
    // Create empty formula (PATCH with empty components list creates the key via the first save)
    // Just switch to editing it — save button will create it
    setFormulas((prev) => [...prev, { formulaKey: key, components: [] }]);
    selectFormula(key);
    setAddingNew(false);
    setNewKey("");
    setSaving(false);
  }

  const detailLines = lines.filter((l) => l.lineType === "detail" && l.isActive !== false);
  const usedCodes = new Set(editComponents.map((c) => c.componentLineCode));

  return (
    <div className="space-y-4">
      {isDraft && (
        <div className="border border-amber-400 bg-amber-50 px-4 py-2.5">
          <span className="text-amber-700 text-xs font-body">
            Estás editando un borrador — las fórmulas no afectan reportes hasta publicar esta versión.
          </span>
        </div>
      )}

      {error && <p className="text-xs font-body text-red-600">{error}</p>}

      <div className="flex gap-4">
        {/* Left: formula list */}
        <div className="w-56 shrink-0">
          <div className="border border-ev-gray7 bg-white">
            <div className="px-3 py-2 border-b border-ev-gray7 flex items-center justify-between">
              <span className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">Fórmulas</span>
              {isDraft && (
                <button
                  onClick={() => { setAddingNew(true); setError(null); setNewKey(""); }}
                  className="text-[10px] font-body text-ev-gray3 hover:text-ev-black"
                  title="Nueva fórmula"
                >
                  + Nueva
                </button>
              )}
            </div>

            {addingNew && isDraft && (
              <div className="px-3 py-2 border-b border-ev-gray7 space-y-1.5">
                <input
                  autoFocus
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                  placeholder="NOMBRE_FORMULA"
                  className="w-full border border-ev-gray6 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ev-black"
                />
                <div className="flex gap-1">
                  <button onClick={createFormula} className="text-[10px] font-body px-2 py-0.5 bg-ev-black text-white hover:bg-ev-gray2">
                    Crear
                  </button>
                  <button onClick={() => setAddingNew(false)} className="text-[10px] font-body px-2 py-0.5 border border-ev-gray6 text-ev-gray3 hover:bg-ev-beige2">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {loading && (
              <div className="p-3 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-7 bg-neutral-100 animate-pulse rounded" />
                ))}
              </div>
            )}

            {!loading && formulas.length === 0 && (
              <p className="px-3 py-4 text-xs font-body text-ev-gray4 text-center">Sin fórmulas</p>
            )}

            {!loading && formulas.map((f) => (
              <button
                key={f.formulaKey}
                onClick={() => selectFormula(f.formulaKey)}
                className={[
                  "w-full text-left px-3 py-2.5 text-xs font-body font-mono border-b border-ev-gray7 transition-colors",
                  selectedKey === f.formulaKey
                    ? "bg-ev-black text-white"
                    : "text-ev-gray2 hover:bg-ev-beige2",
                ].join(" ")}
              >
                <div>{f.formulaKey}</div>
                <div className={`text-[10px] mt-0.5 ${selectedKey === f.formulaKey ? "text-ev-gray6" : "text-ev-gray4"}`}>
                  {f.components.length} componente{f.components.length !== 1 ? "s" : ""}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: component editor */}
        <div className="flex-1">
          {!selectedKey ? (
            <div className="h-48 flex items-center justify-center border border-ev-gray7 bg-ev-beige2">
              <p className="text-sm font-body text-ev-gray4">Selecciona una fórmula para editarla</p>
            </div>
          ) : (
            <div className="border border-ev-gray7 bg-white">
              <div className="px-4 py-3 border-b border-ev-gray7 flex items-center justify-between">
                <div>
                  <span className="text-sm font-body font-mono font-semibold text-ev-black">{selectedKey}</span>
                  <span className="ml-2 text-xs font-body text-ev-gray4">
                    = suma de componentes × operador
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isDraft && (
                    <>
                      <button
                        onClick={deleteFormula}
                        disabled={deleting}
                        className="text-xs font-body text-red-500 hover:text-red-700 disabled:opacity-40"
                      >
                        {deleting ? "..." : "Eliminar fórmula"}
                      </button>
                      <button
                        onClick={addComponent}
                        className="text-xs font-body px-3 py-1 border border-ev-gray6 text-ev-gray3 hover:bg-ev-beige2"
                      >
                        + Componente
                      </button>
                      <button
                        onClick={saveFormula}
                        disabled={saving}
                        className="text-xs font-body px-3 py-1 bg-ev-black text-white hover:bg-ev-gray2 disabled:opacity-40 transition-colors"
                      >
                        {saving ? "Guardando..." : saved ? "✓ Guardado" : "Guardar fórmula"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editComponents.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm font-body text-ev-gray3">
                  Sin componentes.{isDraft && " Usa «+ Componente» para agregar."}
                </div>
              ) : (
                <table className="min-w-full border-collapse">
                  <thead className="bg-ev-beige2">
                    <tr>
                      {["Línea P&L", "Operador", "Orden", isDraft ? "" : undefined]
                        .filter(Boolean)
                        .map((h) => (
                          <th key={h} className="px-4 py-2 text-left text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">
                            {h}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {editComponents.map((comp, idx) => (
                      <tr key={idx} className="border-t border-ev-gray7 hover:bg-ev-beige2">
                        <td className="px-4 py-2.5 min-w-[240px]">
                          {isDraft ? (
                            <select
                              value={comp.componentLineCode}
                              onChange={(e) => updateComponent(idx, { componentLineCode: e.target.value })}
                              className="w-full border border-ev-gray6 px-2 py-1 text-xs font-body bg-white focus:outline-none focus:ring-1 focus:ring-ev-black"
                            >
                              <option value="">— Seleccionar línea —</option>
                              {detailLines.map((l) => (
                                <option
                                  key={l.code}
                                  value={l.code}
                                  disabled={usedCodes.has(l.code) && l.code !== comp.componentLineCode}
                                >
                                  {"  ".repeat(l.level - 1)}{l.code} — {l.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs font-mono text-ev-black">{comp.componentLineCode}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {isDraft ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => updateComponent(idx, { operator: 1 })}
                                className={[
                                  "px-3 py-1 text-xs font-body border transition-colors",
                                  comp.operator === 1
                                    ? "bg-ev-black text-white border-ev-black"
                                    : "border-ev-gray6 text-ev-gray3 hover:bg-ev-beige2",
                                ].join(" ")}
                              >
                                + Suma
                              </button>
                              <button
                                onClick={() => updateComponent(idx, { operator: -1 })}
                                className={[
                                  "px-3 py-1 text-xs font-body border transition-colors",
                                  comp.operator === -1
                                    ? "bg-ev-red text-white border-ev-red"
                                    : "border-ev-gray6 text-ev-gray3 hover:bg-ev-beige2",
                                ].join(" ")}
                              >
                                − Resta
                              </button>
                            </div>
                          ) : (
                            <span className={`text-sm font-body font-bold ${comp.operator === 1 ? "text-ev-green" : "text-red-600"}`}>
                              {comp.operator === 1 ? "+ Suma" : "− Resta"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {isDraft ? (
                            <input
                              type="number"
                              value={comp.sortOrder}
                              onChange={(e) => updateComponent(idx, { sortOrder: Number(e.target.value) })}
                              className="w-16 border border-ev-gray6 px-2 py-1 text-xs font-body text-center focus:outline-none focus:ring-1 focus:ring-ev-black"
                            />
                          ) : (
                            <span className="text-xs font-body text-ev-gray4">{comp.sortOrder}</span>
                          )}
                        </td>
                        {isDraft && (
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => removeComponent(idx)}
                              className="text-xs font-body text-red-500 hover:text-red-700"
                            >
                              Quitar
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
