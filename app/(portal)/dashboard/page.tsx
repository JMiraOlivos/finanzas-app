"use client";

import { useEffect, useState } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiMetric } from "@/lib/eerr";

function defaultPeriod() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDay = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getDate();
  return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-${lastDay}`;
}

export default function DashboardPage() {
  const [period, setPeriod] = useState(defaultPeriod);
  const [kpis,   setKpis]   = useState<KpiMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]  = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard?period=${period}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json() as Promise<KpiMetric[]>;
      })
      .then(setKpis)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-head text-ev-black">Dashboard</h1>
          <p className="text-xs font-body uppercase tracking-[0.1em] text-ev-gray3 mt-1">KPIs consolidados</p>
        </div>
        <input
          type="month"
          value={period.slice(0, 7)}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            const [y, m] = v.split("-").map(Number);
            const last = new Date(y, m, 0).getDate();
            setPeriod(`${v}-${String(last).padStart(2, "0")}`);
          }}
          className="border border-ev-gray6 px-3 py-1.5 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ev-black"
        />
      </div>

      {error && (
        <div className="border border-ev-red/30 bg-ev-beige1 px-4 py-3 text-sm text-ev-darkred font-body">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="border border-ev-gray7 bg-white p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <KpiCard
              key={k.code}
              label={k.label}
              value={k.value}
              format={k.format as "currency" | "percentage" | "number"}
            />
          ))}
        </div>
      )}

      <div className="border border-ev-gray7 bg-white p-5 text-sm text-ev-gray3 font-body">
        <p>Haz click en <a href="/eerr" className="text-ev-black underline hover:text-ev-gray2">EERR YTD</a> para ver el Estado de Resultados completo.</p>
      </div>
    </div>
  );
}
