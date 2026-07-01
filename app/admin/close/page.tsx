"use client";

import { useEffect, useState, useCallback } from "react";
import type { PeriodClose } from "@/app/api/admin/close/route";

const STATUS_LABELS: Record<string, string> = {
  draft:     "Borrador",
  closed:    "Cerrado",
  published: "Publicado",
};

const STATUS_COLORS: Record<string, string> = {
  draft:     "border-ev-gray5 text-ev-gray3",
  closed:    "border-amber-400 text-amber-700 bg-amber-50",
  published: "border-green-500 text-green-700 bg-green-50",
};

type ConfirmState = {
  period: string;
  action: "close" | "publish" | "reopen";
  notes: string;
} | null;

export default function MonthlyClosePage() {
  const [closes,   setCloses]   = useState<PeriodClose[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [confirm,  setConfirm]  = useState<ConfirmState>(null);
  const [working,  setWorking]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/admin/close");
    const data = await r.json() as PeriodClose[];
    setCloses(data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleAction() {
    if (!confirm) return;
    setWorking(true);
    setError(null);
    const res = await fetch("/api/admin/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period_month: confirm.period,
        action:       confirm.action,
        notes:        confirm.notes || undefined,
      }),
    });
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setError(d.error ?? "Error inesperado");
    } else {
      setConfirm(null);
      await load();
    }
    setWorking(false);
  }

  function fmtPeriod(date: string) {
    return new Date(date + "T12:00:00Z").toLocaleDateString("es-CL", {
      month: "long",
      year:  "numeric",
    });
  }

  function fmtDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-CL", { dateStyle: "short" });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-head text-ev-black">Cierre Mensual</h1>
        <p className="text-xs font-body uppercase tracking-[0.1em] text-ev-gray3 mt-1">
          Gestión de estado de períodos de reporte
        </p>
      </div>

      <div className="border border-ev-gray7 bg-white overflow-hidden">
        <table className="min-w-full text-sm border-collapse">
          <thead className="bg-ev-beige2">
            <tr>
              {["Período", "Estado", "Cerrado por", "Cerrado", "Publicado por", "Publicado", ""].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-t border-ev-gray7">
                <td colSpan={7} className="px-4 py-3">
                  <div className="h-4 bg-neutral-100 animate-pulse rounded" />
                </td>
              </tr>
            ))}

            {!loading && closes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm font-body text-ev-gray3">
                  Sin períodos registrados
                </td>
              </tr>
            )}

            {!loading && closes.map((c) => (
              <tr key={c.id} className="border-t border-ev-gray7 hover:bg-ev-beige2">
                <td className="px-4 py-3 font-body text-sm text-ev-black capitalize">
                  {fmtPeriod(c.periodMonth)}
                </td>
                <td className="px-4 py-3">
                  <span className={[
                    "text-[10px] font-body uppercase tracking-wider px-2 py-0.5 border",
                    STATUS_COLORS[c.status] ?? "",
                  ].join(" ")}>
                    {STATUS_LABELS[c.status] ?? c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-body text-ev-gray3">{c.closedBy ?? "—"}</td>
                <td className="px-4 py-3 text-xs font-body text-ev-gray3">{fmtDate(c.closedAt)}</td>
                <td className="px-4 py-3 text-xs font-body text-ev-gray3">{c.publishedBy ?? "—"}</td>
                <td className="px-4 py-3 text-xs font-body text-ev-gray3">{fmtDate(c.publishedAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {c.status === "draft" && (
                      <button
                        onClick={() => setConfirm({ period: c.periodMonth, action: "close", notes: "" })}
                        className="text-xs font-body px-2.5 py-1 border border-amber-400 text-amber-700 hover:bg-amber-50 transition-colors"
                      >
                        Cerrar
                      </button>
                    )}
                    {c.status === "closed" && (
                      <>
                        <button
                          onClick={() => setConfirm({ period: c.periodMonth, action: "publish", notes: "" })}
                          className="text-xs font-body px-2.5 py-1 border border-green-500 text-green-700 hover:bg-green-50 transition-colors"
                        >
                          Publicar
                        </button>
                        <button
                          onClick={() => setConfirm({ period: c.periodMonth, action: "reopen", notes: "" })}
                          className="text-xs font-body px-2.5 py-1 border border-ev-gray6 text-ev-gray3 hover:bg-ev-beige2 transition-colors"
                        >
                          Reabrir
                        </button>
                      </>
                    )}
                    {c.status === "published" && (
                      <span className="text-xs font-body text-ev-gray4">Finalizado</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirmation modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white border border-ev-gray7 w-full max-w-md p-6 space-y-4 shadow-xl">
            <h2 className="font-head text-base text-ev-black">
              {confirm.action === "close"   && "Cerrar período"}
              {confirm.action === "publish" && "Publicar período"}
              {confirm.action === "reopen"  && "Reabrir período"}
            </h2>
            <p className="text-sm font-body text-ev-gray2">
              Período: <strong className="capitalize">{fmtPeriod(confirm.period)}</strong>
            </p>
            {confirm.action === "close" && (
              <p className="text-xs font-body text-ev-gray3">
                Al cerrar el período se marca como revisado. Podrá publicarse después para hacerlo visible al directorio.
              </p>
            )}
            {confirm.action === "publish" && (
              <p className="text-xs font-body text-ev-gray3">
                Al publicar el período sus datos quedan disponibles en los reportes del directorio. Esta acción requiere rol de administrador.
              </p>
            )}
            {confirm.action === "reopen" && (
              <p className="text-xs font-body text-ev-gray3">
                Reabre el período a estado borrador para correcciones. Solo disponible para administradores.
              </p>
            )}
            <div>
              <label className="text-xs font-body uppercase tracking-[0.1em] text-ev-gray3 block mb-1">
                Notas (opcional)
              </label>
              <textarea
                value={confirm.notes}
                onChange={(e) => setConfirm({ ...confirm, notes: e.target.value })}
                rows={2}
                className="w-full border border-ev-gray6 px-3 py-2 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ev-black resize-none"
              />
            </div>
            {error && (
              <p className="text-xs font-body text-red-600">{error}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => { setConfirm(null); setError(null); }}
                className="px-4 py-1.5 text-xs font-body border border-ev-gray6 text-ev-gray3 hover:bg-ev-beige2"
              >
                Cancelar
              </button>
              <button
                onClick={handleAction}
                disabled={working}
                className="px-4 py-1.5 text-xs font-body bg-ev-black text-white hover:bg-ev-gray2 disabled:opacity-40 transition-colors"
              >
                {working ? "Procesando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
