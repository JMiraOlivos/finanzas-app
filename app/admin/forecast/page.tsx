"use client";

import { useRef, useState } from "react";

type ForecastResult = {
  success: true;
  rowCount: number;
  companiesLoaded: string[];
  warnings: string[];
};

export default function ForecastPage() {
  const [file,   setFile]   = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [error,  setError]  = useState<string | null>(null);
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
      const res  = await fetch("/api/forecast", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");
      setResult(data as ForecastResult);
      setStatus("done");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  function reset() {
    setFile(null); setStatus("idle"); setResult(null); setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-head text-ev-black">Cargar Forecast</h1>
        <p className="text-sm font-body text-ev-gray3 mt-1">
          Mismo formato que el presupuesto — el forecast activo anterior se reemplaza automáticamente.
        </p>
      </div>

      <div className="border border-ev-gray7 bg-ev-beige2 px-5 py-4 max-w-lg text-sm space-y-2">
        <p className="font-body font-medium text-ev-black">Formato requerido</p>
        <table className="text-xs border-collapse w-full mt-1">
          <thead>
            <tr className="border-b border-ev-gray7">
              <th className="text-left py-1 pr-4 font-body font-medium text-ev-gray3">Columna</th>
              <th className="text-left py-1 font-body font-medium text-ev-gray3">Ejemplo</th>
            </tr>
          </thead>
          <tbody className="font-body text-ev-gray2">
            {[["empresa","E&V Chile"],["periodo","2026-06"],["linea_pnl","INGRESOS"],["monto","5000000"]].map(([col, ex]) => (
              <tr key={col} className="border-b border-ev-gray7">
                <td className="py-1 pr-4 font-mono text-ev-black">{col}</td>
                <td className="py-1 text-ev-gray3">{ex}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
        <div>
          <label className="block text-sm font-body font-medium text-ev-black mb-1">Archivo CSV o Excel</label>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm font-body text-ev-gray2 file:mr-3 file:py-1.5 file:px-3 file:border file:border-ev-gray6 file:bg-ev-beige2 file:text-sm file:font-body file:cursor-pointer hover:file:bg-ev-beige1"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={status === "uploading" || !file}
            className="px-4 py-2 text-sm font-body bg-ev-black text-white hover:bg-ev-gray1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status === "uploading" ? "Procesando…" : "Cargar forecast"}
          </button>
          {status !== "idle" && (
            <button type="button" onClick={reset} className="px-4 py-2 text-sm font-body border border-ev-gray6 hover:bg-ev-beige2">
              Nueva carga
            </button>
          )}
        </div>
      </form>

      {status === "error" && error && (
        <div className="border border-ev-red/30 bg-red-50 px-4 py-3 text-sm font-body text-ev-red max-w-lg">
          <strong>Error:</strong> {error}
        </div>
      )}

      {status === "done" && result && (
        <div className="max-w-lg space-y-3">
          <div className="border border-ev-gray7 bg-white px-5 py-4">
            <h3 className="font-body font-medium text-ev-black mb-3">Forecast cargado</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm font-body">
              <span className="text-ev-gray3">Filas procesadas</span>
              <span className="font-medium">{result.rowCount.toLocaleString("es-CL")}</span>
              <span className="text-ev-gray3">Empresas</span>
              <span className="font-medium">{result.companiesLoaded.join(", ")}</span>
            </div>
          </div>
          {result.warnings.length > 0 && (
            <div className="border border-orange-200 bg-orange-50 px-5 py-3 space-y-1">
              <p className="text-sm font-body font-medium text-orange-800">
                {result.warnings.length} filas omitidas
              </p>
              {result.warnings.slice(0, 10).map((w, i) => (
                <p key={i} className="text-xs font-body text-orange-700">{w}</p>
              ))}
              {result.warnings.length > 10 && (
                <p className="text-xs font-body text-orange-500">…y {result.warnings.length - 10} más</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
