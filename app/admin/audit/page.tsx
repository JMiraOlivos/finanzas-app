"use client";

import { useEffect, useState, useCallback } from "react";

type AuditRow = {
  id: string; createdAt: string; action: string;
  entityType: string | null; entityId: string | null;
  metadata: Record<string, unknown> | null;
  userEmail: string | null; userName: string | null;
};

type AuditResp = { rows: AuditRow[]; total: number; page: number; pages: number };

const ACTION_LABELS: Record<string, string> = {
  upload_file:    "Carga archivo",
  upload_budget:  "Carga ppto.",
  upload_forecast:"Carga forecast",
  upsert_mapping: "Mapping",
  view_drilldown: "Drill-down",
};

const ACTION_COLORS: Record<string, string> = {
  upload_file:    "bg-blue-100 text-blue-700",
  upload_budget:  "bg-purple-100 text-purple-700",
  upload_forecast:"bg-indigo-100 text-indigo-700",
  upsert_mapping: "bg-yellow-100 text-yellow-700",
  view_drilldown: "bg-gray-100 text-gray-600",
};

export default function AuditPage() {
  const [data,       setData]       = useState<AuditResp | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [filterAct,  setFilterAct]  = useState("");
  const [expanded,   setExpanded]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page) });
    if (filterAct) qs.set("action", filterAct);
    const r = await fetch(`/api/admin/audit?${qs}`);
    setData(await r.json());
    setLoading(false);
  }, [page, filterAct]);

  useEffect(() => { void load(); }, [load]);

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-head text-ev-black">Registro de Auditoría</h1>
          <p className="text-xs font-body uppercase tracking-[0.1em] text-ev-gray3 mt-1">
            {data ? `${data.total.toLocaleString("es-CL")} eventos` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterAct}
            onChange={(e) => { setFilterAct(e.target.value); setPage(1); }}
            className="border border-ev-gray6 px-2 py-1.5 text-xs font-body focus:outline-none"
          >
            <option value="">Todas las acciones</option>
            {Object.entries(ACTION_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="border border-ev-gray7 bg-white overflow-hidden">
        <table className="min-w-full text-sm border-collapse">
          <thead className="bg-ev-beige2">
            <tr>
              {["Fecha", "Usuario", "Acción", "Entidad", ""].map((h) => (
                <th key={h} className="px-4 py-2 text-left text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-t border-ev-gray7">
                <td colSpan={5} className="px-4 py-3">
                  <div className="h-4 bg-neutral-100 animate-pulse rounded" />
                </td>
              </tr>
            ))}
            {!loading && data?.rows.map((r) => (
              <>
                <tr key={r.id} className="border-t border-ev-gray7 hover:bg-ev-beige2">
                  <td className="px-4 py-2.5 text-xs font-body text-ev-gray3 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                  <td className="px-4 py-2.5 text-sm font-body text-ev-black">
                    {r.userName ?? r.userEmail ?? <span className="text-ev-gray4">Sistema</span>}
                    {r.userEmail && r.userName && (
                      <span className="block text-xs text-ev-gray3">{r.userEmail}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={["text-xs font-body px-2 py-0.5 rounded-full", ACTION_COLORS[r.action] ?? "bg-gray-100 text-gray-600"].join(" ")}>
                      {ACTION_LABELS[r.action] ?? r.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-body text-ev-gray3">
                    {r.entityType ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.metadata && (
                      <button
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        className="text-xs font-body text-ev-gray3 underline hover:text-ev-black"
                      >
                        {expanded === r.id ? "Cerrar" : "Ver"}
                      </button>
                    )}
                  </td>
                </tr>
                {expanded === r.id && r.metadata && (
                  <tr key={`${r.id}-meta`} className="border-t border-ev-gray7 bg-ev-beige2">
                    <td colSpan={5} className="px-8 py-3">
                      <pre className="text-xs font-mono text-ev-gray2 whitespace-pre-wrap break-all">
                        {JSON.stringify(r.metadata, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {!loading && data?.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm font-body text-ev-gray3">
                  Sin eventos registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-xs font-body text-ev-gray3">
          <span>Página {data.page} de {data.pages}</span>
          <div className="flex gap-1">
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1 border border-ev-gray6 hover:bg-ev-beige2 disabled:opacity-40"
            >
              ← Anterior
            </button>
            <button
              disabled={page >= data.pages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 border border-ev-gray6 hover:bg-ev-beige2 disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
