"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ExplanationResponse } from "@/lib/ai/types";

const DIRECTION_ICON: Record<string, string> = {
  positive: "▲",
  negative: "▼",
  neutral:  "●",
};
const DIRECTION_COLOR: Record<string, string> = {
  positive: "text-ev-green",
  negative: "text-ev-red",
  neutral:  "text-ev-gray4",
};

type Props = {
  loading: boolean;
  error: string | null;
  result: ExplanationResponse | null;
  onRetry: () => void;
};

export function AiExplanationModal({ loading, error, result, onRetry }: Props) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50 animate-[fadeIn_120ms_ease]" />
      <Dialog.Content
        className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-50
                   w-full max-w-2xl max-h-[85vh] overflow-y-auto
                   bg-white border border-ev-gray6 shadow-lg focus:outline-none"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-ev-gray7 px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-ev-black text-sm">✦</span>
              <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">
                Análisis con IA
              </p>
            </div>
            <Dialog.Title className="text-base font-head text-ev-black leading-snug">
              {result?.title ?? (loading ? "Analizando…" : "Análisis")}
            </Dialog.Title>
          </div>
          <Dialog.Close className="text-ev-gray4 hover:text-ev-black text-xl leading-none mt-1 flex-shrink-0">
            ✕
          </Dialog.Close>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Loading */}
          {loading && (
            <div className="space-y-3 animate-pulse">
              <div className="h-3 bg-neutral-100 w-full" />
              <div className="h-3 bg-neutral-100 w-5/6" />
              <div className="h-3 bg-neutral-100 w-4/5" />
              <div className="h-px bg-neutral-100 my-4" />
              <div className="grid grid-cols-2 gap-3">
                {[0,1,2,3].map((i) => <div key={i} className="h-14 bg-neutral-100" />)}
              </div>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="border border-ev-red/30 bg-red-50 px-4 py-3 space-y-2">
              <p className="text-xs font-body text-ev-red font-medium">No fue posible generar la explicación</p>
              <p className="text-[11px] font-body text-ev-gray2">{error}</p>
              <button
                onClick={onRetry}
                className="text-[10px] font-body text-ev-gray3 hover:text-ev-black underline underline-offset-2"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Result */}
          {!loading && !error && result && (
            <>
              {/* Explanation prose */}
              <p className="text-[12px] font-body text-ev-gray2 leading-relaxed whitespace-pre-line">
                {result.explanation}
              </p>

              {/* Key numbers */}
              {result.keyNumbers.length > 0 && (
                <div>
                  <p className="text-[10px] font-body font-semibold uppercase tracking-[0.1em] text-ev-gray3 mb-2">
                    Cifras clave
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {result.keyNumbers.map((kn, i) => (
                      <div key={i} className="border border-ev-gray7 p-3">
                        <p className="text-[9px] font-body uppercase tracking-wider text-ev-gray4 mb-1">{kn.label}</p>
                        <p className="text-sm font-head text-ev-black tabular-nums">{kn.value}</p>
                        {kn.change && (
                          <p className="text-[10px] font-body text-ev-gray3 mt-0.5">{kn.change}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Drivers */}
              {result.drivers.length > 0 && (
                <div>
                  <p className="text-[10px] font-body font-semibold uppercase tracking-[0.1em] text-ev-gray3 mb-2">
                    Factores explicativos
                  </p>
                  <div className="space-y-2">
                    {result.drivers.map((d, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span className={["text-[10px] font-body mt-0.5 flex-shrink-0", DIRECTION_COLOR[d.direction] ?? "text-ev-gray4"].join(" ")}>
                          {DIRECTION_ICON[d.direction] ?? "●"}
                        </span>
                        <div>
                          <span className="text-xs font-body font-medium text-ev-black">{d.label}</span>
                          <span className="text-[11px] font-body text-ev-gray3 ml-1.5">{d.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Caveats */}
              {result.caveats.length > 0 && (
                <div className="border-t border-ev-gray7 pt-3">
                  {result.caveats.map((c, i) => (
                    <p key={i} className="text-[10px] font-body text-ev-gray4">⚠ {c}</p>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="border-t border-ev-gray7 pt-3">
                <span className="text-[9px] font-body text-ev-gray5 uppercase tracking-wider">
                  {result.modelName} · prompt {result.promptVersion}
                </span>
              </div>
            </>
          )}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
