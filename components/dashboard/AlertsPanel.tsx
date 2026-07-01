"use client";

export type Alert = {
  severity: "red" | "yellow";
  message: string;
  detail?: string;
};

type Props = {
  alerts: Alert[];
  loading?: boolean;
};

const SEVERITY = {
  red:    { dot: "bg-ev-red",   bg: "bg-red-50",    border: "border-red-200",    text: "text-red-700"    },
  yellow: { dot: "bg-yellow-400", bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-800" },
};

export function AlertsPanel({ alerts, loading }: Props) {
  return (
    <div className="border border-ev-gray7 bg-white p-5 space-y-3">
      <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">Alertas</p>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-neutral-100 animate-pulse rounded" />
          ))}
        </div>
      )}

      {!loading && alerts.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-ev-gray3 font-body py-2">
          <span className="w-2 h-2 rounded-full bg-ev-green inline-block" />
          Sin alertas — datos en orden
        </div>
      )}

      {!loading && alerts.map((a, i) => {
        const s = SEVERITY[a.severity];
        return (
          <div key={i} className={["flex items-start gap-3 rounded px-3 py-2 text-sm border", s.bg, s.border].join(" ")}>
            <span className={["w-2 h-2 rounded-full mt-1 shrink-0", s.dot].join(" ")} />
            <div>
              <span className={["font-body font-medium", s.text].join(" ")}>{a.message}</span>
              {a.detail && <span className={["block text-xs mt-0.5 font-body", s.text].join(" ")}>{a.detail}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
