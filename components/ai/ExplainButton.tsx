"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AiExplanationModal } from "./AiExplanationModal";
import type { ExplanationResponse } from "@/lib/ai/types";

type Props = {
  period: string;
  companyIds?: string | null;    // single companyId from URL filter
  targetType: "kpi" | "bullet";
  metricCode: string;
  companyId?: string | null;     // for bullet: the specific company
  label?: string;
};

export function ExplainButton({
  period,
  companyIds,
  targetType,
  metricCode,
  companyId,
  label = "Explicar",
}: Props) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<ExplanationResponse | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  // Reset cached result when context changes
  useEffect(() => { setResult(null); setError(null); }, [period, companyIds, metricCode, companyId]);

  async function fetchExplanation() {
    if (result) return; // cached
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/explain", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period,
          companyIds: companyIds ? [companyIds] : null,
          targetType,
          metricCode,
          companyId: companyId ?? null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Error del servidor" })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setResult(await res.json() as ExplanationResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  // Trigger fetch when dialog opens
  useEffect(() => { if (open) fetchExplanation(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[10px] font-body text-ev-gray4
                     hover:text-ev-black transition-colors leading-none"
          title={`Analizar ${metricCode} con IA`}
        >
          <span className="text-[9px]">✦</span>
          {label}
        </button>
      </Dialog.Trigger>

      <AiExplanationModal
        loading={loading}
        error={error}
        result={result}
        onRetry={() => { setResult(null); fetchExplanation(); }}
      />
    </Dialog.Root>
  );
}
