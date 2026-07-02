"use client";

import { useState, useEffect } from "react";

type ValidationError = {
  code: string;
  message: string;
};

type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
};

type Props = {
  versionId: string;
  versionName: string;
  onClose: () => void;
  onPublished: () => void;
};

type Stage = "validating" | "ready" | "has_errors" | "publishing" | "done" | "error";

export function PublishPnlVersionDialog({ versionId, versionName, onClose, onPublished }: Props) {
  const [stage,      setStage]      = useState<Stage>("validating");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [publishErr, setPublishErr] = useState<string | null>(null);

  useEffect(() => {
    void runValidation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runValidation() {
    setStage("validating");
    const res = await fetch(`/api/admin/pnl/versions/${versionId}/validate`);
    const data = await res.json() as ValidationResult;
    setValidation(data);
    setStage(data.valid ? "ready" : "has_errors");
  }

  async function handlePublish() {
    setStage("publishing");
    setPublishErr(null);

    const res = await fetch(`/api/admin/pnl/versions/${versionId}/publish`, {
      method: "POST",
    });

    if (res.ok) {
      setStage("done");
    } else {
      const d = await res.json() as { error?: string };
      setPublishErr(d.error ?? "Error inesperado al publicar");
      setStage("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-ev-gray7 w-full max-w-lg shadow-xl">

        {/* Header */}
        <div className="px-6 py-4 border-b border-ev-gray7">
          <h2 className="font-head text-base text-ev-black">Publicar versión P&amp;L</h2>
          <p className="text-xs font-body text-ev-gray4 mt-0.5">{versionName}</p>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Validating */}
          {stage === "validating" && (
            <div className="flex items-center gap-3 py-4 text-sm font-body text-ev-gray3">
              <div className="w-4 h-4 border-2 border-ev-gray6 border-t-ev-black rounded-full animate-spin shrink-0" />
              Verificando estructura...
            </div>
          )}

          {/* Has errors */}
          {stage === "has_errors" && validation && (
            <div className="space-y-3">
              <div className="border border-red-300 bg-red-50 px-4 py-3">
                <p className="text-sm font-body text-red-700 font-semibold">
                  No se puede publicar — {validation.errors.length} error{validation.errors.length !== 1 ? "es" : ""} estructural{validation.errors.length !== 1 ? "es" : ""}
                </p>
                <p className="text-xs font-body text-red-600 mt-1">
                  Corrígelos en las pestañas Estructura, Mappings o Fórmulas antes de publicar.
                </p>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {validation.errors.map((e, i) => (
                  <div key={i} className="flex gap-2 text-xs font-body">
                    <span className="text-red-500 font-mono shrink-0">{e.code}</span>
                    <span className="text-ev-gray2">{e.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ready to publish */}
          {(stage === "ready" || stage === "publishing") && validation && (
            <div className="space-y-4">
              <div className="border border-ev-green bg-green-50 px-4 py-3 flex items-center gap-2">
                <span className="text-ev-green text-lg">✓</span>
                <p className="text-sm font-body text-ev-green font-semibold">Estructura válida — lista para publicar</p>
              </div>

              {validation.warnings.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">
                    Advertencias ({validation.warnings.length})
                  </p>
                  {validation.warnings.map((w, i) => (
                    <div key={i} className="flex gap-2 text-xs font-body border border-amber-200 bg-amber-50 px-3 py-1.5">
                      <span className="text-amber-600 font-mono shrink-0">{w.code}</span>
                      <span className="text-amber-700">{w.message}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="border border-ev-gray7 bg-ev-beige2 px-4 py-3 space-y-1 text-xs font-body text-ev-gray3">
                <p className="font-semibold text-ev-gray2">Al publicar ocurrirá lo siguiente:</p>
                <ul className="list-disc list-inside space-y-0.5 mt-1">
                  <li>La versión activa actual pasará a estado <strong>archivado</strong></li>
                  <li>Esta versión quedará como la estructura <strong>activa</strong> de reportes</li>
                  <li>Se disparará un <strong>refresh de dbt</strong> para recalcular los marts</li>
                  <li>Los cambios serán visibles en el dashboard y EERR una vez que dbt termine</li>
                </ul>
              </div>
            </div>
          )}

          {/* Publishing spinner */}
          {stage === "publishing" && (
            <div className="flex items-center gap-2 text-sm font-body text-ev-gray3">
              <div className="w-4 h-4 border-2 border-ev-gray6 border-t-ev-black rounded-full animate-spin shrink-0" />
              Publicando y disparando dbt...
            </div>
          )}

          {/* Done */}
          {stage === "done" && (
            <div className="space-y-3">
              <div className="border border-ev-green bg-green-50 px-4 py-4 text-center">
                <p className="text-2xl mb-1">✓</p>
                <p className="text-sm font-body font-semibold text-ev-green">Versión publicada exitosamente</p>
                <p className="text-xs font-body text-ev-gray3 mt-1">
                  Se ha disparado el refresh de dbt. Los reportes se actualizarán en algunos minutos.
                </p>
              </div>
            </div>
          )}

          {/* Publish error */}
          {stage === "error" && publishErr && (
            <div className="border border-red-300 bg-red-50 px-4 py-3">
              <p className="text-sm font-body text-red-700">{publishErr}</p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-ev-gray7 flex justify-end gap-2">
          {stage === "done" ? (
            <button
              onClick={onPublished}
              className="px-5 py-1.5 text-xs font-body bg-ev-black text-white hover:bg-ev-gray2 transition-colors"
            >
              Cerrar
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={stage === "publishing"}
                className="px-4 py-1.5 text-xs font-body border border-ev-gray6 text-ev-gray3 hover:bg-ev-beige2 disabled:opacity-40"
              >
                Cancelar
              </button>
              {stage === "ready" && (
                <button
                  onClick={handlePublish}
                  className="px-5 py-1.5 text-xs font-body bg-ev-black text-white hover:bg-ev-gray2 transition-colors"
                >
                  Publicar versión
                </button>
              )}
              {stage === "has_errors" && (
                <button
                  onClick={runValidation}
                  className="px-4 py-1.5 text-xs font-body border border-ev-gray6 text-ev-gray3 hover:bg-ev-beige2"
                >
                  Revalidar
                </button>
              )}
              {stage === "error" && (
                <button
                  onClick={handlePublish}
                  className="px-4 py-1.5 text-xs font-body bg-ev-black text-white hover:bg-ev-gray2"
                >
                  Reintentar
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
