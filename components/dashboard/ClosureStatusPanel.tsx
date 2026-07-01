"use client";

import { formatCurrency } from "@/lib/formatters";

export type ControlRow = {
  companyId: string;
  companyName: string;
  periodMonth: string;
  status: "green" | "yellow" | "red";
  unmappedAccountCount: number;
  unmappedAmount: number;
  imbalance: number;
};

type Props = {
  rows: ControlRow[];
  loading?: boolean;
};

const STATUS_DOT: Record<ControlRow["status"], string> = {
  green:  "bg-ev-green",
  yellow: "bg-yellow-400",
  red:    "bg-ev-red",
};

function aggregateBadge(rows: ControlRow[]): { text: string; cls: string } {
  if (rows.length === 0)                      return { text: "Sin datos para el período",           cls: "text-ev-gray3" };
  if (rows.some((r) => r.status === "red"))   return { text: "No publicable — errores de balance",  cls: "text-ev-red font-medium" };
  if (rows.some((r) => r.status === "yellow")) return { text: "Publicable con advertencias",         cls: "text-yellow-700 font-medium" };
  return                                             { text: "Listo para publicar",                  cls: "text-ev-green font-medium" };
}

export function ClosureStatusPanel({ rows, loading }: Props) {
  const badge = aggregateBadge(rows);

  return (
    <div className="border border-ev-gray7 bg-white p-5 space-y-3">
      <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">Estado de cierre</p>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-6 bg-neutral-100 animate-pulse rounded" />)}
        </div>
      )}

      {!loading && (
        <>
          <p className={`text-sm font-body ${badge.cls}`}>{badge.text}</p>

          <div className="space-y-1.5 pt-1">
            {rows.map((r) => {
              const detail =
                r.status === "red"    ? `Desbalance $${formatCurrency(r.imbalance)}` :
                r.status === "yellow" ? `${r.unmappedAccountCount} cta. sin mapear`  : null;
              return (
                <div key={r.companyId} className="flex items-center justify-between text-sm font-body">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[r.status]}`} />
                    <span className="text-ev-gray2 truncate">{r.companyName}</span>
                  </div>
                  {detail && (
                    <span className="text-xs text-ev-gray3 shrink-0 ml-2">{detail}</span>
                  )}
                </div>
              );
            })}
          </div>

          {rows.length > 0 && (
            <div className="pt-2 border-t border-ev-gray7">
              <a
                href="/admin/control"
                className="text-xs font-body text-ev-gray3 underline underline-offset-2 hover:text-ev-black"
              >
                Ver centro de control →
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
