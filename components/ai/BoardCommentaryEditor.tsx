"use client";

import { useEffect, useState } from "react";
import type { BoardCommentaryData } from "@/app/api/ai/board-commentary/route";

type Props = {
  period: string;
  companyIds?: string | null;
};

export function BoardCommentaryEditor({ period, companyIds }: Props) {
  const [data,       setData]       = useState<BoardCommentaryData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [editText,   setEditText]   = useState("");
  const [error,      setError]      = useState<string | null>(null);

  // Load existing commentary whenever period/scope changes
  useEffect(() => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ period });
    if (companyIds) qs.set("companyIds", companyIds);
    fetch(`/api/ai/board-commentary?${qs}`)
      .then((r) => r.json() as Promise<BoardCommentaryData | null>)
      .then((d) => {
        setData(d);
        setEditText(d?.comment ?? "");
      })
      .catch(() => setError("Error al cargar el comentario"))
      .finally(() => setLoading(false));
  }, [period, companyIds]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/board-commentary", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ period, companyIds: companyIds ? [companyIds] : null }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({ error: "Error del servidor" })) as { error?: string };
        throw new Error(msg.error ?? `HTTP ${res.status}`);
      }
      const d = await res.json() as BoardCommentaryData;
      setData(d);
      setEditText(d.comment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error generando comentario");
    } finally {
      setGenerating(false);
    }
  }

  async function patch(newText?: string, newStatus?: "approved" | "draft") {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (newText !== undefined) body.body   = newText;
      if (newStatus !== undefined) body.status = newStatus;
      const res = await fetch(`/api/ai/board-commentary/${data.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({ error: "Error del servidor" })) as { error?: string };
        throw new Error(msg.error ?? `HTTP ${res.status}`);
      }
      const updated = await res.json() as BoardCommentaryData;
      setData(updated);
      setEditText(updated.comment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando cambios");
    } finally {
      setSaving(false);
    }
  }

  const isApproved = data?.status === "approved";
  const isDirty    = data !== null && editText !== data.comment;
  const isBusy     = generating || saving;

  const periodLabel = (() => {
    try {
      return new Date(period + "T12:00:00Z").toLocaleDateString("es-CL", { month: "long", year: "numeric" });
    } catch { return period; }
  })();

  const approvedDateLabel = data?.approvedAt
    ? new Date(data.approvedAt).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="border border-ev-gray7 bg-white">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ev-gray7">
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">
            Comentario para el Directorio
          </p>
          {!loading && data && (
            <span
              className={[
                "text-[9px] font-body uppercase tracking-wider px-1.5 py-0.5",
                isApproved
                  ? "bg-green-100 text-green-700"
                  : "bg-neutral-100 text-ev-gray3",
              ].join(" ")}
            >
              {isApproved ? "Aprobado" : "Borrador"}
            </span>
          )}
        </div>

        {/* Regenerar — visible solo si hay datos y el usuario puede aprobar */}
        {!loading && data?.canApprove && !isApproved && (
          <button
            onClick={generate}
            disabled={isBusy}
            className="text-[10px] font-body text-ev-gray4 hover:text-ev-black transition-colors disabled:opacity-40"
            title="Regenerar comentario"
          >
            {generating ? "Generando…" : "Regenerar ↺"}
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div className="p-4">

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-neutral-100 w-full" />
            <div className="h-3 bg-neutral-100 w-5/6" />
            <div className="h-3 bg-neutral-100 w-4/6" />
          </div>
        )}

        {/* Empty state — no commentary yet */}
        {!loading && !data && (
          <div className="text-center py-6 space-y-3">
            <p className="text-xs font-body text-ev-gray3 leading-relaxed max-w-md mx-auto">
              Genera el comentario ejecutivo del Board Pack para {periodLabel}.
              Se basará en los KPIs, drivers de variación y estado de empresas del período.
            </p>
            <button
              onClick={generate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-ev-black text-white
                         text-xs font-body hover:bg-ev-gray2 disabled:opacity-40 transition-colors"
            >
              <span className="text-[10px]">✦</span>
              {generating ? "Generando comentario…" : "Generar comentario IA"}
            </button>
            {generating && (
              <p className="text-[10px] font-body text-ev-gray4 animate-pulse">
                Analizando datos del período…
              </p>
            )}
          </div>
        )}

        {/* Commentary present */}
        {!loading && data && (
          <div className="space-y-3">

            {/* Approved: read-only text block */}
            {isApproved ? (
              <div className="space-y-2">
                <p className="text-xs font-body text-ev-gray2 leading-relaxed whitespace-pre-wrap">
                  {data.comment}
                </p>
                {approvedDateLabel && data.approvedBy && (
                  <p className="text-[9px] font-body text-ev-gray5">
                    Aprobado el {approvedDateLabel} por {data.approvedBy}
                  </p>
                )}
              </div>
            ) : (
              // Draft: editable textarea
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                disabled={isBusy}
                rows={12}
                className="w-full resize-none text-xs font-body border border-ev-gray6 px-3 py-2.5
                           focus:outline-none focus:ring-1 focus:ring-ev-black
                           disabled:opacity-50 leading-relaxed text-ev-gray2"
                placeholder="Comentario ejecutivo para el directorio…"
              />
            )}

            {/* Action bar */}
            {data.canApprove && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <div>
                  {error && (
                    <p className="text-[10px] font-body text-ev-red">{error}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isApproved ? (
                    // Revoke approval
                    <button
                      onClick={() => patch(undefined, "draft")}
                      disabled={isBusy}
                      className="text-[10px] font-body text-ev-gray4 hover:text-ev-black
                                 border border-ev-gray6 px-2.5 py-1.5 transition-colors disabled:opacity-40"
                    >
                      {saving ? "Guardando…" : "Revocar aprobación"}
                    </button>
                  ) : (
                    <>
                      {/* Save text changes */}
                      {isDirty && (
                        <button
                          onClick={() => patch(editText)}
                          disabled={isBusy}
                          className="text-[10px] font-body text-ev-gray4 hover:text-ev-black
                                     border border-ev-gray6 px-2.5 py-1.5 transition-colors disabled:opacity-40"
                        >
                          {saving ? "Guardando…" : "Guardar cambios"}
                        </button>
                      )}

                      {/* Approve */}
                      <button
                        onClick={() => patch(isDirty ? editText : undefined, "approved")}
                        disabled={isBusy || !editText.trim()}
                        className="text-[10px] font-body bg-ev-black text-white
                                   px-3 py-1.5 hover:bg-ev-gray2 disabled:opacity-40 transition-colors"
                      >
                        {saving ? "Aprobando…" : "✓ Aprobar para Board Pack"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {/* Error on load (no data) */}
        {!loading && !data && error && (
          <p className="text-[10px] font-body text-ev-red mt-2">{error}</p>
        )}

        {/* Generating overlay when there's already data */}
        {generating && data && (
          <div className="mt-3 text-[10px] font-body text-ev-gray4 animate-pulse text-center">
            Regenerando comentario con datos actualizados…
          </div>
        )}

      </div>

      {/* ── Footer ── */}
      {!loading && data && (
        <div className="px-4 py-2 border-t border-ev-gray7 bg-neutral-50">
          <p className="text-[9px] font-body text-ev-gray5">
            Generado por IA (claude-sonnet-4-6) · Solo comentarios aprobados se incluyen en el Board Pack PDF
          </p>
        </div>
      )}
    </div>
  );
}
