"use client";

import { useRef, useState } from "react";

type BudgetResult = {
  success: true;
  rowCount: number;
  companiesLoaded: string[];
  warnings: string[];
};

export default function BudgetPage() {
  const [file,    setFile]    = useState<File | null>(null);
  const [status,  setStatus]  = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result,  setResult]  = useState<BudgetResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setStatus("uploading");
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res  = await fetch("/api/budget", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");
      setResult(data as BudgetResult);
      setStatus("done");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  function reset() {
    setFile(null);
    setStatus("idle");
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Cargar Presupuesto</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Sube un archivo Excel o CSV con el presupuesto mensual por empresa y línea P&L.
        </p>
      </div>

      {/* Format guide */}
      <div className="rounded-xl border bg-neutral-50 px-5 py-4 max-w-lg text-sm space-y-2">
        <p className="font-medium text-neutral-700">Formato requerido</p>
        <p className="text-neutral-500">El archivo debe tener estas columnas (en cualquier orden):</p>
        <table className="text-xs border-collapse w-full mt-1">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1 pr-4 font-medium text-neutral-600">Columna</th>
              <th className="text-left py-1 font-medium text-neutral-600">Ejemplo</th>
            </tr>
          </thead>
          <tbody className="text-neutral-600">
            <tr className="border-b border-neutral-200">
              <td className="py-1 pr-4 font-mono">empresa</td>
              <td className="py-1">E&V Chile</td>
            </tr>
            <tr className="border-b border-neutral-200">
              <td className="py-1 pr-4 font-mono">periodo</td>
              <td className="py-1">2026-01</td>
            </tr>
            <tr className="border-b border-neutral-200">
              <td className="py-1 pr-4 font-mono">linea_pnl</td>
              <td className="py-1">INGRESOS &nbsp;(código) o etiqueta exacta</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 font-mono">monto</td>
              <td className="py-1">5000000 &nbsp;(positivo = ingreso, negativo = gasto)</td>
            </tr>
          </tbody>
        </table>
        <p className="text-neutral-400 text-xs">
          Una nueva versión de presupuesto reemplaza automáticamente la versión activa anterior para cada empresa+año.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Archivo CSV o Excel</label>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-neutral-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-neutral-300 file:bg-neutral-50 file:text-sm file:font-medium file:cursor-pointer hover:file:bg-neutral-100"
          />
          <p className="text-xs text-neutral-400 mt-1">Soporta .csv, .xls y .xlsx</p>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={status === "uploading" || !file}
            className="px-4 py-2 text-sm font-medium rounded bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "uploading" ? "Procesando…" : "Cargar presupuesto"}
          </button>
          {status !== "idle" && (
            <button type="button" onClick={reset} className="px-4 py-2 text-sm rounded border hover:bg-neutral-50">
              Nueva carga
            </button>
          )}
        </div>
      </form>

      {/* Error */}
      {status === "error" && error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 max-w-lg">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Result */}
      {status === "done" && result && (
        <div className="max-w-lg space-y-3">
          <div className="rounded-xl border bg-green-50 px-5 py-4">
            <h3 className="font-semibold text-green-800 mb-3">Presupuesto cargado</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <span className="text-neutral-600">Filas procesadas</span>
              <span className="font-medium">{result.rowCount.toLocaleString("es-CL")}</span>
              <span className="text-neutral-600">Empresas</span>
              <span className="font-medium">{result.companiesLoaded.join(", ")}</span>
            </div>
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-5 py-3 space-y-1">
              <p className="text-sm font-medium text-orange-800">Advertencias ({result.warnings.length} filas omitidas)</p>
              {result.warnings.slice(0, 10).map((w, i) => (
                <p key={i} className="text-xs text-orange-700">{w}</p>
              ))}
              {result.warnings.length > 10 && (
                <p className="text-xs text-orange-500">…y {result.warnings.length - 10} más</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
