"use client";

import { useState } from "react";

type Props = {
  sourceVersionId:   string;
  sourceVersionName: string;
  onClose:           () => void;
  onRolledBack:      () => void;
};

type Stage = "confirm" | "rolling_back" | "done" | "error";

export function RollbackPnlVersionDialog({
  sourceVersionId,
  sourceVersionName,
  onClose,
  onRolledBack,
}: Props) {
  const [stage,   setStage]   = useState<Stage>("confirm");
  const [newName, setNewName] = useState(`Restauración de: ${sourceVersionName}`);
  const [error,   setError]   = useState<string | null>(null);

  async function handleRollback() {
    if (!newName.trim()) return;
    setStage("rolling_back");
    setError(null);

    const res = await fetch(`/api/admin/pnl/versions/${sourceVersionId}/rollback`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: newName.trim() }),
    });

    if (res.ok) {
      setStage("done");
    } else {
      const d = await res.json() as { error?: string };
      setError(d.error ?? "Error inesperado al restaurar");
      setStage("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-ev-gray7 w-full max-w-lg shadow-xl">

        {/* Header */}
        <div className="px-6 py-4 border-b border-ev-gray7">
          <h2 className="font-head text-base text-ev-black">Restaurar versión P&L</h2>
          <p className="text-xs font-body text-ev-gray4 mt-0.5">Origen: {sourceVersionName}</p>
        </div>

        <div className="px-6 py-5 space-y-4">

          {(stage === "confirm" || stage === "rolling_back") && (
            <>
              <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-body text-amber-700 space-y-1">
                <p className="font-semibold">Se creará un nuevo borrador basado en esta versión.</p>
                <ul className="list-disc list-inside space-y-0.5 mt-1">
                  <li>Se copian todas las líneas, mappings y fórmulas</li>
                  <li>El borrador debe validarse y publicarse para activarse</li>
                  <li>La versión activa actual no se modifica</li>
                </ul>
              </div>

              <div>
                <label className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 block mb-1">
                  Nombre del nuevo borrador *
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={stage === "rolling_back"}
                  className="w-full border border-ev-gray6 px-3 py-2 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ev-black disabled:opacity-60"
                />
              </div>

              {stage === "rolling_back" && (
                <div className="flex items-center gap-2 text-sm font-body text-ev-gray3">
                  <div className="w-4 h-4 border-2 border-ev-gray6 border-t-ev-black rounded-full animate-spin shrink-0" />
                  Restaurando versión...
                </div>
              )}
            </>
          )}

          {stage === "done" && (
            <div className="border border-ev-green bg-green-50 px-4 py-4 text-center space-y-1">
              <p className="text-2xl">✓</p>
              <p className="text-sm font-body font-semibold text-ev-green">Borrador creado exitosamente</p>
              <p className="text-xs font-body text-ev-gray3 mt-1">
                Aparecerá en la lista de versiones. Valídalo y publícalo para activarlo.
              </p>
            </div>
          )}

          {stage === "error" && error && (
            <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm font-body text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-ev-gray7 flex justify-end gap-2">
          {stage === "done" ? (
            <button
              onClick={onRolledBack}
              className="px-5 py-1.5 text-xs font-body bg-ev-black text-white hover:bg-ev-gray2 transition-colors"
            >
              Cerrar
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={stage === "rolling_back"}
                className="px-4 py-1.5 text-xs font-body border border-ev-gray6 text-ev-gray3 hover:bg-ev-beige2 disabled:opacity-40"
              >
                Cancelar
              </button>
              {stage === "confirm" && (
                <button
                  onClick={handleRollback}
                  disabled={!newName.trim()}
                  className="px-5 py-1.5 text-xs font-body bg-ev-black text-white hover:bg-ev-gray2 disabled:opacity-40 transition-colors"
                >
                  Crear borrador
                </button>
              )}
              {stage === "error" && (
                <button
                  onClick={handleRollback}
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
