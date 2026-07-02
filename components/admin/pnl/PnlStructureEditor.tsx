"use client";

import { useState, useEffect, useCallback } from "react";
import { PnlLineEditorDialog } from "./PnlLineEditorDialog";

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

type Version = {
  id: string;
  name: string;
  status: string;
};

type Props = {
  version: Version;
};

const LINE_TYPE_LABELS: Record<string, string> = {
  detail:     "Detalle",
  subtotal:   "Subtotal",
  calculated: "Calculado",
};

const TYPE_COLORS: Record<string, string> = {
  detail:     "border-ev-gray6 text-ev-gray3",
  subtotal:   "border-amber-400 text-amber-700 bg-amber-50",
  calculated: "border-blue-400 text-blue-700 bg-blue-50",
};

export function PnlStructureEditor({ version }: Props) {
  const [lines,      setLines]      = useState<PnlLine[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [dialog,     setDialog]     = useState<"add" | PnlLine | null>(null);
  const [deleting,   setDeleting]   = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  const isDraft = version.status === "draft";

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/admin/pnl/versions/${version.id}/lines`);
    const data = await r.json() as PnlLine[];
    setLines(data);
    setLoading(false);
  }, [version.id]);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete(lineId: string) {
    if (!confirm("¿Desactivar esta línea?")) return;
    setDeleting(lineId);
    setError(null);
    const res = await fetch(`/api/admin/pnl/versions/${version.id}/lines/${lineId}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setError(d.error ?? "Error al desactivar");
    } else {
      await load();
    }
    setDeleting(null);
  }

  const activeLinesCount = lines.filter((l) => l.isActive).length;
  const maxSortOrder = lines.reduce((m, l) => Math.max(m, l.sortOrder), 0);

  return (
    <div className="space-y-4">
      {/* Draft banner */}
      {isDraft && (
        <div className="border border-amber-400 bg-amber-50 px-4 py-2.5 flex items-center gap-2">
          <span className="text-amber-700 text-xs font-body">
            Estás editando un borrador — los cambios no afectan reportes hasta publicar esta versión.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-body text-ev-gray3">
          {activeLinesCount} línea{activeLinesCount !== 1 ? "s" : ""} activa{activeLinesCount !== 1 ? "s" : ""}
        </p>
        {isDraft && (
          <button
            onClick={() => setDialog("add")}
            className="px-4 py-1.5 text-xs font-body bg-ev-black text-white hover:bg-ev-gray2 transition-colors"
          >
            + Agregar línea
          </button>
        )}
      </div>

      {error && <p className="text-xs font-body text-red-600">{error}</p>}

      <div className="border border-ev-gray7 bg-white overflow-hidden">
        <table className="min-w-full text-sm border-collapse">
          <thead className="bg-ev-beige2">
            <tr>
              {["Orden", "Código", "Etiqueta", "Padre", "Tipo", "Nivel", "Estado", isDraft ? "" : undefined]
                .filter(Boolean)
                .map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-t border-ev-gray7">
                <td colSpan={8} className="px-3 py-3">
                  <div className="h-3.5 bg-neutral-100 animate-pulse rounded" />
                </td>
              </tr>
            ))}

            {!loading && lines.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm font-body text-ev-gray3">
                  Esta versión no tiene líneas. {isDraft && "Usa «Agregar línea» para comenzar."}
                </td>
              </tr>
            )}

            {!loading && lines.map((line) => (
              <tr
                key={line.id}
                className={[
                  "border-t border-ev-gray7 hover:bg-ev-beige2",
                  !line.isActive ? "opacity-40" : "",
                ].join(" ")}
              >
                <td className="px-3 py-2.5 text-xs font-body text-ev-gray4 tabular-nums">{line.sortOrder}</td>
                <td className="px-3 py-2.5">
                  <span className={`text-xs font-body font-mono ${line.isBold ? "font-bold" : ""} ${line.isHighlighted ? "text-ev-black" : "text-ev-gray2"}`}>
                    {line.code}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-sm font-body text-ev-black" style={{ paddingLeft: `${(line.level - 1) * 16 + 12}px` }}>
                  {line.label}
                </td>
                <td className="px-3 py-2.5 text-xs font-body text-ev-gray4 font-mono">{line.parentCode ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <span className={`text-[10px] font-body uppercase tracking-wider px-2 py-0.5 border ${TYPE_COLORS[line.lineType]}`}>
                    {LINE_TYPE_LABELS[line.lineType]}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs font-body text-ev-gray4">{line.level}</td>
                <td className="px-3 py-2.5">
                  {line.isActive
                    ? <span className="text-[10px] font-body uppercase tracking-wider text-ev-green">Activa</span>
                    : <span className="text-[10px] font-body uppercase tracking-wider text-ev-gray5">Inactiva</span>}
                </td>
                {isDraft && (
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setDialog(line)}
                        className="text-xs font-body text-ev-gray3 hover:text-ev-black underline"
                      >
                        Editar
                      </button>
                      {line.isActive && (
                        <button
                          onClick={() => handleDelete(line.id)}
                          disabled={deleting === line.id}
                          className="text-xs font-body text-red-500 hover:text-red-700 disabled:opacity-40"
                        >
                          {deleting === line.id ? "..." : "Desactivar"}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog && (
        <PnlLineEditorDialog
          versionId={version.id}
          existingLines={lines}
          editingLine={dialog === "add" ? null : dialog}
          maxSortOrder={maxSortOrder}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); void load(); }}
        />
      )}
    </div>
  );
}
