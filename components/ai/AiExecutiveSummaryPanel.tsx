"use client";

import { useEffect, useState, useCallback } from "react";
import type { PeriodSummaryResponse } from "@/lib/ai/types";
import { AiFindingCard } from "./AiFindingCard";
import { AiRecommendedActions } from "./AiRecommendedActions";

type PanelState = "checking" | "idle" | "loading" | "success" | "error";

type Props = {
  period: string;
  companyIds?: string | null;
};

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-body font-semibold uppercase tracking-[0.1em] text-ev-gray3 mb-2">
      {label}
    </p>
  );
}

function formatAge(generatedAt: string): string {
  const ms = Date.now() - new Date(generatedAt).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 2)  return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(ms / 3_600_000);
  if (hours  < 24)  return `hace ${hours} h`;
  const days = Math.round(ms / 86_400_000);
  return `hace ${days} d`;
}

export function AiExecutiveSummaryPanel({ period, companyIds }: Props) {
  const [state,    setState]    = useState<PanelState>("checking");
  const [result,   setResult]   = useState<PeriodSummaryResponse | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Load cached result on mount or when context changes
  const loadCached = useCallback(() => {
    setState("checking");
    setResult(null);
    setError(null);
    setExpanded(false);
    const qs = new URLSearchParams({ period });
    fetch(`/api/ai/period-summary?${qs}`)
      .then((r) => r.json() as Promise<PeriodSummaryResponse | null>)
      .then((data) => {
        console.log("[AiPanel] cache data:", JSON.stringify({ headline: (data as Record<string,unknown>)?.headline, findingsLen: (data as Record<string,unknown>)?.findings?.length ?? "undefined" }));
        if (data) { setResult(data); setState("success"); setExpanded(true); }
        else       { setState("idle"); }
      })
      .catch(() => setState("idle"));
  }, [period]);

  useEffect(() => { loadCached(); }, [loadCached]);

  async function generate() {
    setState("loading");
    setExpanded(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/period-summary", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          period,
          companyIds: companyIds ? [companyIds] : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Error del servidor" })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as PeriodSummaryResponse;
      (data as Record<string, unknown>).generatedAt = new Date().toISOString();
      setResult(data);
      setState("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setState("error");
    }
  }

  return (
    <div className="border border-ev-gray7 bg-white">
      {/* ── Header ── */}
      <div className="px-5 py-3 border-b border-ev-gray7 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-ev-black text-sm select-none">✦</span>
          <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">
            Análisis Ejecutivo con IA
          </p>
          {state === "checking" && (
            <span className="text-[10px] font-body text-ev-gray5 animate-pulse">cargando…</span>
          )}
          {state === "success" && result && (
            <span className="text-[10px] font-body text-ev-gray5">
              · {formatAge(result.generatedAt as unknown as string)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {state === "loading" && (
            <span className="text-[10px] font-body text-ev-gray4 animate-pulse">Analizando…</span>
          )}
          {state === "idle" && (
            <button
              onClick={generate}
              className="text-xs font-body px-3 py-1.5 bg-ev-black text-white hover:bg-ev-gray2 transition-colors"
            >
              Analizar período
            </button>
          )}
          {state === "success" && result && (
            <>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-[10px] font-body text-ev-gray3 hover:text-ev-black underline underline-offset-2 transition-colors"
              >
                {expanded ? "Ocultar ▲" : "Ver análisis ▼"}
              </button>
              <button
                onClick={generate}
                className="text-[10px] font-body text-ev-gray4 hover:text-ev-black transition-colors"
                title="Actualizar análisis"
              >
                ↺ Actualizar
              </button>
            </>
          )}
          {state === "error" && (
            <button
              onClick={generate}
              className="text-xs font-body px-3 py-1.5 bg-ev-black text-white hover:bg-ev-gray2 transition-colors"
            >
              Reintentar
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      {expanded && (
        <div className="p-5 space-y-5">

          {/* Loading */}
          {state === "loading" && (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-neutral-100 w-3/4" />
              <div className="h-3 bg-neutral-100 w-full" />
              <div className="h-3 bg-neutral-100 w-5/6" />
              <div className="h-3 bg-neutral-100 w-4/5" />
              <div className="grid grid-cols-3 gap-3 pt-2">
                {[0,1,2].map((i) => <div key={i} className="h-20 bg-neutral-100" />)}
              </div>
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div className="border border-ev-red/30 bg-red-50 px-4 py-3 space-y-2">
              <p className="text-xs font-body text-ev-red font-medium">No fue posible generar el análisis</p>
              <p className="text-[11px] font-body text-ev-gray2">{error}</p>
            </div>
          )}

          {/* Success */}
          {state === "success" && result && (
            <div className="space-y-5">

              {/* Headline */}
              <p className="text-base font-head text-ev-black">{result.headline}</p>

              {/* Executive summary */}
              <div className="space-y-1">
                <SectionHeader label="Resumen ejecutivo" />
                <p className="text-[12px] font-body text-ev-gray2 leading-relaxed whitespace-pre-line">
                  {result.executiveSummary}
                </p>
              </div>

              {/* Findings */}
              {(result.findings?.length ?? 0) > 0 && (
                <div>
                  <SectionHeader label="Hallazgos clave" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {result.findings.map((f, i) => (
                      <AiFindingCard key={i} finding={f} />
                    ))}
                  </div>
                </div>
              )}

              {/* Risks */}
              {(result.risks?.length ?? 0) > 0 && (
                <div>
                  <SectionHeader label="Riesgos identificados" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {result.risks.map((r, i) => (
                      <AiFindingCard key={i} finding={r} />
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {(result.recommendedActions?.length ?? 0) > 0 && (
                <div>
                  <SectionHeader label="Acciones recomendadas" />
                  <AiRecommendedActions actions={result.recommendedActions} />
                </div>
              )}

              {/* DQ caveats */}
              {(result.dataQualityCaveats?.length ?? 0) > 0 && (
                <div className="border-t border-ev-gray7 pt-3">
                  <p className="text-[10px] font-body text-ev-gray4 uppercase tracking-wider mb-1">Caveats de datos</p>
                  <ul className="space-y-0.5">
                    {result.dataQualityCaveats.map((c, i) => (
                      <li key={i} className="text-[11px] font-body text-ev-gray3">⚠ {c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Footer */}
              <div className="border-t border-ev-gray7 pt-3 flex items-center gap-3 flex-wrap">
                <span className="text-[9px] font-body text-ev-gray5 uppercase tracking-wider">
                  {result.modelName} · prompt {result.promptVersion}
                </span>
                <span className="text-[9px] font-body text-ev-gray5">
                  Basado en datos dbt certificados — no genera SQL ni accede a asientos crudos
                </span>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
