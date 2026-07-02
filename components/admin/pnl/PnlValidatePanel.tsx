"use client";

import { useState } from "react";

type ValidationError = {
  code: string;
  message: string;
  context?: Record<string, unknown>;
};

type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
};

type Props = {
  versionId: string;
  versionName: string;
};

export function PnlValidatePanel({ versionId, versionName }: Props) {
  const [result,    setResult]    = useState<ValidationResult | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function runValidation() {
    setLoading(true);
    setError(null);
    setResult(null);

    const res = await fetch(`/api/admin/pnl/versions/${versionId}/validate`);
    if (res.status === 401 || res.status === 403) {
      setError("Sin permisos para validar");
      setLoading(false);
      return;
    }

    const data = await res.json() as ValidationResult;
    setResult(data);
    setLoading(false);
  }

  return (
    <div className="border border-ev-gray7 bg-white">
      <div className="px-4 py-3 border-b border-ev-gray7 flex items-center justify-between">
        <div>
          <span className="text-sm font-head text-ev-black">Validación estructural</span>
          <span className="ml-2 text-xs font-body text-ev-gray4">— {versionName}</span>
        </div>
        <button
          onClick={runValidation}
          disabled={loading}
          className="text-xs font-body px-4 py-1.5 bg-ev-black text-white hover:bg-ev-gray2 disabled:opacity-40 transition-colors"
        >
          {loading ? "Validando..." : "Validar ahora"}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 text-xs font-body text-red-600">{error}</div>
      )}

      {!result && !loading && !error && (
        <div className="px-4 py-8 text-center text-sm font-body text-ev-gray4">
          Haz clic en «Validar ahora» para verificar la integridad de la estructura.
        </div>
      )}

      {loading && (
        <div className="px-4 py-8 text-center text-sm font-body text-ev-gray4">
          <div className="inline-block w-4 h-4 border-2 border-ev-gray6 border-t-ev-black rounded-full animate-spin mr-2" />
          Analizando estructura...
        </div>
      )}

      {result && (
        <div className="p-4 space-y-4">
          {/* Summary badge */}
          <div className={[
            "flex items-center gap-3 px-4 py-3 border",
            result.valid ? "border-ev-green bg-green-50" : "border-red-400 bg-red-50",
          ].join(" ")}>
            <span className={`text-xl ${result.valid ? "text-ev-green" : "text-red-600"}`}>
              {result.valid ? "✓" : "✗"}
            </span>
            <div>
              <p className={`text-sm font-body font-semibold ${result.valid ? "text-ev-green" : "text-red-700"}`}>
                {result.valid ? "Estructura válida" : `${result.errors.length} error${result.errors.length !== 1 ? "es" : ""} encontrado${result.errors.length !== 1 ? "s" : ""}`}
              </p>
              {result.warnings.length > 0 && (
                <p className="text-xs font-body text-amber-700 mt-0.5">
                  {result.warnings.length} advertencia{result.warnings.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>

          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">Errores (bloquean publicación)</p>
              {result.errors.map((e, i) => (
                <div key={i} className="flex gap-3 border border-red-200 bg-red-50 px-3 py-2.5">
                  <span className="text-red-500 text-xs font-body font-mono shrink-0">{e.code}</span>
                  <span className="text-xs font-body text-red-700">{e.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">Advertencias</p>
              {result.warnings.map((w, i) => (
                <div key={i} className="flex gap-3 border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <span className="text-amber-600 text-xs font-body font-mono shrink-0">{w.code}</span>
                  <span className="text-xs font-body text-amber-700">{w.message}</span>
                </div>
              ))}
            </div>
          )}

          {result.valid && result.warnings.length === 0 && (
            <p className="text-xs font-body text-ev-gray3 text-center py-2">
              Sin errores ni advertencias. La versión está lista para publicar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
