"use client";

import { useState } from "react";

type Suggestion = {
  pnlLineCode: string;
  lineLabel:   string;
  explanation: string;
  confidence:  "high" | "medium" | "low";
};

type Props = {
  accountCode: string;
  accountName: string | null;
  versionId:   string;
  onSuggest:   (pnlLineCode: string) => void;
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high:   "text-ev-green",
  medium: "text-amber-600",
  low:    "text-ev-gray4",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high:   "alta",
  medium: "media",
  low:    "baja",
};

export function AiMappingSuggestionButton({ accountCode, accountName, versionId, onSuggest }: Props) {
  const [loading,    setLoading]    = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  async function handleSuggest() {
    setLoading(true);
    setError(null);
    setSuggestion(null);

    const res = await fetch("/api/ai/suggest-pnl-mapping", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ accountCode, accountName, versionId }),
    });

    if (res.ok) {
      const data = await res.json() as Suggestion;
      setSuggestion(data);
      onSuggest(data.pnlLineCode);
    } else {
      const d = await res.json() as { error?: string };
      setError(d.error ?? "Error al obtener sugerencia");
    }
    setLoading(false);
  }

  if (suggestion) {
    return (
      <div className="flex items-start gap-1.5 mt-1">
        <span className="text-[10px] text-ev-gray4 shrink-0 mt-0.5">✨ IA:</span>
        <div className="min-w-0">
          <span className="text-[10px] font-body font-mono text-ev-black">{suggestion.pnlLineCode}</span>
          {suggestion.explanation && (
            <span className="text-[10px] font-body text-ev-gray4 ml-1">— {suggestion.explanation}</span>
          )}
          <span className={`ml-1.5 text-[9px] font-body uppercase tracking-wider ${CONFIDENCE_COLORS[suggestion.confidence]}`}>
            {CONFIDENCE_LABELS[suggestion.confidence]}
          </span>
        </div>
        <button
          onClick={() => { setSuggestion(null); setError(null); }}
          className="text-[10px] font-body text-ev-gray5 hover:text-ev-gray3 shrink-0 ml-1"
          title="Limpiar sugerencia"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1">
      {loading ? (
        <span className="flex items-center gap-1 text-[10px] font-body text-ev-gray4">
          <span className="inline-block w-3 h-3 border border-ev-gray6 border-t-ev-gray3 rounded-full animate-spin" />
          Consultando IA...
        </span>
      ) : (
        <button
          onClick={handleSuggest}
          className="text-[10px] font-body text-ev-gray3 hover:text-ev-black underline"
        >
          ✨ Sugerir con IA
        </button>
      )}
      {error && (
        <p className="text-[10px] font-body text-red-500 mt-0.5">{error}</p>
      )}
    </div>
  );
}
