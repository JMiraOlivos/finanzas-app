"use client";

import { useEffect, useState, useCallback } from "react";
import type { Comment } from "@/app/api/comments/route";

type Props = {
  period:       string;
  companyId?:   string | null;
  pnlLineCode?: string | null;
  userRole?:    string;
};

export function CommentsPanel({ period, companyId, pnlLineCode, userRole }: Props) {
  const [comments,  setComments]  = useState<Comment[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [newText,   setNewText]   = useState("");
  const [visibility, setVisibility] = useState<"internal" | "board">("internal");
  const [saving,    setSaving]    = useState(false);

  const canWrite = userRole === "admin" || userRole === "finance";
  const canDelete = userRole === "admin" || userRole === "finance";

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ period });
    if (companyId)   qs.set("companyId",   companyId);
    if (pnlLineCode) qs.set("pnlLineCode", pnlLineCode);
    fetch(`/api/comments?${qs}`)
      .then((r) => r.json() as Promise<Comment[]>)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period, companyId, pnlLineCode]);

  useEffect(() => { load(); }, [load]);

  async function handlePost() {
    if (!newText.trim()) return;
    setSaving(true);
    await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period_month: period,
        company_id:   companyId ?? null,
        pnl_line_code: pnlLineCode ?? null,
        comment:      newText.trim(),
        visibility,
      }),
    });
    setNewText("");
    setSaving(false);
    load();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/comments/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="border border-ev-gray7 bg-white">
      <div className="px-5 py-3 border-b border-ev-gray7">
        <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">
          Comentarios Finanzas
        </p>
      </div>

      <div className="p-5 space-y-3">
        {loading && (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-10 bg-neutral-100 animate-pulse rounded" />
            ))}
          </div>
        )}

        {!loading && comments.length === 0 && (
          <p className="text-xs text-ev-gray3 font-body">Sin comentarios para este período</p>
        )}

        {!loading && comments.map((c) => (
          <div key={c.id} className="border border-ev-gray7 px-4 py-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-body text-ev-black leading-snug">{c.comment}</p>
              {canDelete && (
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-ev-gray4 hover:text-ev-red text-xs shrink-0"
                  title="Eliminar"
                >
                  ×
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-ev-gray4 font-body">
              <span>{c.createdBy}</span>
              <span>·</span>
              <span>{new Date(c.createdAt).toLocaleDateString("es-CL")}</span>
              <span
                className={[
                  "px-1.5 py-0.5 border text-[9px] uppercase tracking-wider",
                  c.visibility === "board"
                    ? "border-ev-black text-ev-black"
                    : "border-ev-gray6 text-ev-gray4",
                ].join(" ")}
              >
                {c.visibility === "board" ? "Directorio" : "Interno"}
              </span>
              {c.companyName && <span>· {c.companyName}</span>}
              {c.pnlLineCode && <span>· {c.pnlLineCode}</span>}
            </div>
          </div>
        ))}

        {canWrite && (
          <div className="pt-3 border-t border-ev-gray7 space-y-2">
            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Agregar comentario..."
              rows={3}
              className="w-full border border-ev-gray6 px-3 py-2 text-sm font-body text-ev-black focus:outline-none focus:ring-1 focus:ring-ev-black resize-none"
            />
            <div className="flex items-center gap-3">
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as "internal" | "board")}
                className="text-xs border border-ev-gray6 px-2 py-1 font-body text-ev-gray2 focus:outline-none"
              >
                <option value="internal">Interno</option>
                <option value="board">Directorio</option>
              </select>
              <button
                onClick={handlePost}
                disabled={saving || !newText.trim()}
                className="px-4 py-1.5 bg-ev-black text-white text-xs font-body hover:bg-ev-gray2 disabled:opacity-40 transition-colors"
              >
                {saving ? "Guardando..." : "Agregar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
