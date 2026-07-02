"use client";

import { useState, useEffect, useCallback } from "react";

type ChangeEntry = {
  id:             string;
  changeType:     string;
  entityType:     string;
  entityCode:     string | null;
  beforeValue:    Record<string, unknown> | null;
  afterValue:     Record<string, unknown> | null;
  changedAt:      string;
  changedByEmail: string | null;
};

type HistoryData = {
  version: { id: string; name: string; status: string };
  entries: ChangeEntry[];
};

type Props = {
  versionId: string;
};

const CHANGE_TYPE_LABELS: Record<string, string> = {
  "line.add":     "Línea agregada",
  "line.update":  "Línea modificada",
  "line.delete":  "Línea eliminada",
  "line.reorder": "Reordenado",
  "publish":      "Publicado",
  "archive":      "Archivado",
  "rollback":     "Restaurado desde",
};

const CHANGE_TYPE_COLORS: Record<string, string> = {
  "publish":      "border-ev-green text-ev-green bg-green-50",
  "archive":      "border-ev-gray5 text-ev-gray4 bg-ev-beige2",
  "rollback":     "border-amber-300 text-amber-700 bg-amber-50",
  "line.add":     "border-blue-200 text-blue-700 bg-blue-50",
  "line.update":  "border-ev-gray6 text-ev-gray3 bg-white",
  "line.delete":  "border-red-200 text-red-600 bg-red-50",
  "line.reorder": "border-ev-gray6 text-ev-gray4 bg-white",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

export function PnlChangeHistory({ versionId }: Props) {
  const [data,    setData]    = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/pnl/versions/${versionId}/history`);
    if (!res.ok) {
      setError("Error al cargar el historial");
    } else {
      setData(await res.json() as HistoryData);
    }
    setLoading(false);
  }, [versionId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-10 text-sm font-body text-ev-gray3">
        <div className="w-4 h-4 border-2 border-ev-gray6 border-t-ev-black rounded-full animate-spin shrink-0" />
        Cargando historial...
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 px-4 py-3 text-xs font-body text-red-700">
        {error}
      </div>
    );
  }

  if (!data) return null;

  if (data.entries.length === 0) {
    return (
      <div className="py-10 text-center text-sm font-body text-ev-gray3">
        Sin cambios registrados para esta versión.
      </div>
    );
  }

  return (
    <div className="border border-ev-gray7 bg-white divide-y divide-ev-gray7">
      {data.entries.map((entry) => {
        const label  = CHANGE_TYPE_LABELS[entry.changeType] ?? entry.changeType;
        const colors = CHANGE_TYPE_COLORS[entry.changeType] ?? "border-ev-gray6 text-ev-gray3 bg-white";

        return (
          <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
            {/* Badge */}
            <span className={`text-[10px] font-body uppercase tracking-wider px-2 py-0.5 border whitespace-nowrap shrink-0 ${colors}`}>
              {label}
            </span>

            {/* Entity code */}
            {entry.entityCode && (
              <span className="font-mono text-xs text-ev-gray3 flex-1 truncate">
                {entry.entityCode}
                {entry.changeType === "rollback" && (
                  <span className="font-sans not-italic text-ev-gray4 ml-1">(versión origen)</span>
                )}
              </span>
            )}
            {!entry.entityCode && <span className="flex-1" />}

            {/* Meta */}
            <div className="text-right shrink-0">
              <div className="text-[10px] font-body text-ev-gray4">{fmtDate(entry.changedAt)}</div>
              {entry.changedByEmail && (
                <div className="text-[10px] font-body text-ev-gray5">{entry.changedByEmail}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
