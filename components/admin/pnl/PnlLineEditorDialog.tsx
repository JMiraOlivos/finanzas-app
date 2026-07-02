"use client";

import { useState, useEffect } from "react";

type PnlLine = {
  id: string;
  code: string;
  label: string;
  parentCode: string | null;
  level: number;
  sortOrder: number;
  lineType: "detail" | "subtotal" | "calculated";
  formulaKey: string | null;
  showInReport: boolean;
  isBold: boolean;
  isHighlighted: boolean;
  isActive: boolean;
};

type Props = {
  versionId: string;
  existingLines: PnlLine[];
  editingLine?: PnlLine | null;
  maxSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
};

const LINE_TYPE_LABELS: Record<string, string> = {
  detail:     "Detalle",
  subtotal:   "Subtotal",
  calculated: "Calculado",
};

export function PnlLineEditorDialog({ versionId, existingLines, editingLine, maxSortOrder, onClose, onSaved }: Props) {
  const isEdit = !!editingLine;

  const [code,         setCode]         = useState(editingLine?.code ?? "");
  const [label,        setLabel]        = useState(editingLine?.label ?? "");
  const [parentCode,   setParentCode]   = useState(editingLine?.parentCode ?? "");
  const [level,        setLevel]        = useState(editingLine?.level ?? 1);
  const [sortOrder,    setSortOrder]    = useState(editingLine?.sortOrder ?? maxSortOrder + 10);
  const [lineType,     setLineType]     = useState<"detail" | "subtotal" | "calculated">(editingLine?.lineType ?? "detail");
  const [formulaKey,   setFormulaKey]   = useState(editingLine?.formulaKey ?? "");
  const [showInReport, setShowInReport] = useState(editingLine?.showInReport ?? true);
  const [isBold,       setIsBold]       = useState(editingLine?.isBold ?? false);
  const [isHighlighted, setIsHighlighted] = useState(editingLine?.isHighlighted ?? false);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Auto-uppercase code
  useEffect(() => { setCode((c) => c.toUpperCase()); }, [code]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !label.trim()) { setError("Código y etiqueta son requeridos"); return; }

    setSaving(true);
    setError(null);

    const payload = {
      code:         code.trim(),
      label:        label.trim(),
      parentCode:   parentCode || null,
      level,
      sortOrder,
      lineType,
      formulaKey:   formulaKey.trim() || null,
      showInReport,
      isBold,
      isHighlighted,
    };

    const url = isEdit
      ? `/api/admin/pnl/versions/${versionId}/lines/${editingLine!.id}`
      : `/api/admin/pnl/versions/${versionId}/lines`;

    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setError(d.error ?? "Error inesperado");
    } else {
      onSaved();
    }
    setSaving(false);
  }

  const parentOptions = existingLines.filter((l) => l.isActive && l.id !== editingLine?.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-ev-gray7 w-full max-w-lg p-6 shadow-xl">
        <h2 className="font-head text-base text-ev-black mb-4">
          {isEdit ? `Editar línea: ${editingLine!.code}` : "Nueva línea P&L"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 block mb-1">
                Código *
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={isEdit}
                placeholder="INGRESOS"
                className="w-full border border-ev-gray6 px-3 py-1.5 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ev-black disabled:bg-ev-beige2 disabled:text-ev-gray4"
              />
            </div>
            <div>
              <label className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 block mb-1">
                Tipo *
              </label>
              <select
                value={lineType}
                onChange={(e) => setLineType(e.target.value as typeof lineType)}
                className="w-full border border-ev-gray6 px-3 py-1.5 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ev-black bg-white"
              >
                {Object.entries(LINE_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 block mb-1">
              Etiqueta *
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ingresos Totales"
              className="w-full border border-ev-gray6 px-3 py-1.5 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ev-black"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 block mb-1">
                Línea padre
              </label>
              <select
                value={parentCode}
                onChange={(e) => setParentCode(e.target.value)}
                className="w-full border border-ev-gray6 px-3 py-1.5 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ev-black bg-white"
              >
                <option value="">— Sin padre —</option>
                {parentOptions.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.code} — {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 block mb-1">
                Nivel
              </label>
              <input
                type="number"
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                min={1}
                max={6}
                className="w-full border border-ev-gray6 px-3 py-1.5 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ev-black"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 block mb-1">
                Orden
              </label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                min={1}
                className="w-full border border-ev-gray6 px-3 py-1.5 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ev-black"
              />
            </div>
            {lineType === "calculated" && (
              <div>
                <label className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 block mb-1">
                  Formula key *
                </label>
                <input
                  value={formulaKey}
                  onChange={(e) => setFormulaKey(e.target.value.toUpperCase())}
                  placeholder="EBITDA"
                  className="w-full border border-ev-gray6 px-3 py-1.5 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ev-black"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm font-body text-ev-gray2 cursor-pointer">
              <input type="checkbox" checked={showInReport} onChange={(e) => setShowInReport(e.target.checked)} className="accent-ev-black" />
              Mostrar en reporte
            </label>
            <label className="flex items-center gap-2 text-sm font-body text-ev-gray2 cursor-pointer">
              <input type="checkbox" checked={isBold} onChange={(e) => setIsBold(e.target.checked)} className="accent-ev-black" />
              Negrita
            </label>
            <label className="flex items-center gap-2 text-sm font-body text-ev-gray2 cursor-pointer">
              <input type="checkbox" checked={isHighlighted} onChange={(e) => setIsHighlighted(e.target.checked)} className="accent-ev-black" />
              Destacado
            </label>
          </div>

          {error && <p className="text-xs font-body text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-ev-gray7">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-body border border-ev-gray6 text-ev-gray3 hover:bg-ev-beige2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 text-xs font-body bg-ev-black text-white hover:bg-ev-gray2 disabled:opacity-40 transition-colors"
            >
              {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Agregar línea"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
