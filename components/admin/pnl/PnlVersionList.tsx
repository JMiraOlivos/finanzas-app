"use client";

import { useState, useEffect, useCallback } from "react";

type PnlVersion = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  isActive: boolean;
  createdAt: string;
  publishedAt: string | null;
  createdByEmail: string | null;
  lineCount: number;
};

type Props = {
  onSelectVersion: (version: PnlVersion) => void;
};

const STATUS_LABELS: Record<string, string> = {
  draft:     "Borrador",
  published: "Publicado",
  archived:  "Archivado",
};
const STATUS_COLORS: Record<string, string> = {
  draft:     "border-ev-gray5 text-ev-gray3",
  published: "border-ev-green text-ev-green bg-green-50",
  archived:  "border-ev-gray6 text-ev-gray5 bg-ev-beige2",
};

type CreateDialogState = { open: false } | { open: true; mode: "new" | "duplicate"; sourceId?: string; sourceName?: string };

export function PnlVersionList({ onSelectVersion }: Props) {
  const [versions, setVersions] = useState<PnlVersion[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [dialog,   setDialog]   = useState<CreateDialogState>({ open: false });
  const [newName,  setNewName]  = useState("");
  const [newDesc,  setNewDesc]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/admin/pnl/versions");
    const data = await r.json() as PnlVersion[];
    setVersions(data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setNewName(""); setNewDesc(""); setError(null);
    setDialog({ open: true, mode: "new" });
  }

  function openDuplicate(v: PnlVersion) {
    setNewName(`${v.name} (copia)`); setNewDesc(""); setError(null);
    setDialog({ open: true, mode: "duplicate", sourceId: v.id, sourceName: v.name });
  }

  async function handleCreate() {
    if (!newName.trim()) { setError("El nombre es requerido"); return; }
    if (!dialog.open) return;
    setSaving(true); setError(null);

    if (dialog.mode === "new") {
      const res = await fetch("/api/admin/pnl/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDesc || undefined }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Error inesperado");
      } else {
        setDialog({ open: false }); await load();
      }
    } else {
      const res = await fetch(`/api/admin/pnl/versions/${dialog.sourceId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDesc || undefined }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Error inesperado");
      } else {
        setDialog({ open: false }); await load();
      }
    }
    setSaving(false);
  }

  function fmtDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-CL", { dateStyle: "short" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={openCreate}
          className="px-4 py-1.5 text-xs font-body bg-ev-black text-white hover:bg-ev-gray2 transition-colors"
        >
          + Nueva versión
        </button>
      </div>

      <div className="border border-ev-gray7 bg-white overflow-hidden">
        <table className="min-w-full text-sm border-collapse">
          <thead className="bg-ev-beige2">
            <tr>
              {["Nombre", "Estado", "Líneas", "Creado por", "Creado", "Publicado", ""].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} className="border-t border-ev-gray7">
                <td colSpan={7} className="px-4 py-3">
                  <div className="h-4 bg-neutral-100 animate-pulse rounded" />
                </td>
              </tr>
            ))}
            {!loading && versions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm font-body text-ev-gray3">
                  Sin versiones. Crea la primera versión para comenzar.
                </td>
              </tr>
            )}
            {!loading && versions.map((v) => (
              <tr key={v.id} className="border-t border-ev-gray7 hover:bg-ev-beige2">
                <td className="px-4 py-3">
                  <div className="font-body text-sm text-ev-black">{v.name}</div>
                  {v.description && (
                    <div className="text-xs font-body text-ev-gray4 mt-0.5">{v.description}</div>
                  )}
                  {v.isActive && (
                    <span className="text-[10px] font-body uppercase tracking-wider text-ev-green">• Activa</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-body uppercase tracking-wider px-2 py-0.5 border ${STATUS_COLORS[v.status]}`}>
                    {STATUS_LABELS[v.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-body text-ev-gray3 tabular-nums">{v.lineCount}</td>
                <td className="px-4 py-3 text-xs font-body text-ev-gray4">{v.createdByEmail ?? "—"}</td>
                <td className="px-4 py-3 text-xs font-body text-ev-gray4">{fmtDate(v.createdAt)}</td>
                <td className="px-4 py-3 text-xs font-body text-ev-gray4">{fmtDate(v.publishedAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onSelectVersion(v)}
                      className="text-xs font-body text-ev-gray3 hover:text-ev-black underline"
                    >
                      Ver estructura
                    </button>
                    <button
                      onClick={() => openDuplicate(v)}
                      className="text-xs font-body text-ev-gray3 hover:text-ev-black underline"
                    >
                      Duplicar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white border border-ev-gray7 w-full max-w-md p-6 space-y-4 shadow-xl">
            <h2 className="font-head text-base text-ev-black">
              {dialog.mode === "new" ? "Nueva versión P&L" : `Duplicar: ${dialog.sourceName}`}
            </h2>
            {dialog.mode === "duplicate" && (
              <p className="text-xs font-body text-ev-gray3">
                Se copiarán todas las líneas, mappings y fórmulas de la versión origen al nuevo borrador.
              </p>
            )}
            <div>
              <label className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 block mb-1">
                Nombre *
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Estructura 2025 v2"
                className="w-full border border-ev-gray6 px-3 py-2 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ev-black"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 block mb-1">
                Descripción (opcional)
              </label>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
                className="w-full border border-ev-gray6 px-3 py-2 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ev-black resize-none"
              />
            </div>
            {error && <p className="text-xs font-body text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setDialog({ open: false })}
                className="px-4 py-1.5 text-xs font-body border border-ev-gray6 text-ev-gray3 hover:bg-ev-beige2"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-4 py-1.5 text-xs font-body bg-ev-black text-white hover:bg-ev-gray2 disabled:opacity-40 transition-colors"
              >
                {saving ? "Creando..." : dialog.mode === "new" ? "Crear borrador" : "Duplicar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
