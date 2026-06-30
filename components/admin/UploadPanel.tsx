"use client";

import { useRef, useState } from "react";
import { formatCurrency } from "@/lib/formatters";

type Company = { id: string; name: string };

type UploadResult = {
  success: true;
  uploadedFileId: string;
  companyName: string;
  periodMonth: string;
  rowCount: number;
  totalDebit: number;
  totalCredit: number;
  pnlRowCount: number;
  unmappedAccounts: { accountCode: string; accountName: string | null; movementCount: number; totalAmount: number }[];
};

type Props = {
  companies: Company[];
};

export function UploadPanel({ companies }: Props) {
  const [companyId,  setCompanyId]  = useState("");
  const [period,     setPeriod]     = useState("");
  const [file,       setFile]       = useState<File | null>(null);
  const [status,     setStatus]     = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result,     setResult]     = useState<UploadResult | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !companyId) return;

    setStatus("uploading");
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("companyId", companyId);
    if (period) fd.append("period", period + "-01");

    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");
      setResult(data as UploadResult);
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
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Empresa</label>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            required
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
          >
            <option value="">Seleccionar empresa…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Período <span className="text-neutral-400 font-normal">(opcional — se infiere del archivo)</span>
          </label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Archivo Excel</label>
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-neutral-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-neutral-300 file:bg-neutral-50 file:text-sm file:font-medium file:cursor-pointer hover:file:bg-neutral-100"
          />
          <p className="text-xs text-neutral-400 mt-1">Soporta .xls y .xlsx · Máximo 50 MB</p>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={status === "uploading" || !file || !companyId}
            className="px-4 py-2 text-sm font-medium rounded bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "uploading" ? "Procesando…" : "Cargar archivo"}
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
        <div className="max-w-2xl space-y-4">
          <div className="rounded-xl border bg-green-50 px-5 py-4">
            <h3 className="font-semibold text-green-800 mb-3">Carga exitosa</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <span className="text-neutral-600">Empresa</span>
              <span className="font-medium">{result.companyName}</span>
              <span className="text-neutral-600">Período</span>
              <span className="font-medium">{result.periodMonth}</span>
              <span className="text-neutral-600">Filas cargadas</span>
              <span className="font-medium">{result.rowCount.toLocaleString("es-CL")}</span>
              <span className="text-neutral-600">Filas P&L</span>
              <span className="font-medium">{result.pnlRowCount.toLocaleString("es-CL")}</span>
              <span className="text-neutral-600">Total Debe</span>
              <span className="font-medium tabular-nums">{formatCurrency(result.totalDebit)}</span>
              <span className="text-neutral-600">Total Haber</span>
              <span className="font-medium tabular-nums">{formatCurrency(result.totalCredit)}</span>
            </div>
          </div>

          {result.unmappedAccounts.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <h3 className="font-semibold text-amber-800 mb-1">
                {result.unmappedAccounts.length} cuenta{result.unmappedAccounts.length !== 1 ? "s" : ""} P&L sin mapear
              </h3>
              <p className="text-sm text-amber-700 mb-3">
                Estas cuentas no aparecerán en el EERR hasta que les asignes una línea PnL.
              </p>
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 pr-4 font-medium text-amber-800">Código</th>
                    <th className="text-left py-1 pr-4 font-medium text-amber-800">Nombre</th>
                    <th className="text-right py-1 font-medium text-amber-800 tabular-nums">Monto</th>
                    <th className="text-right py-1 pl-4 font-medium text-amber-800">Movimientos</th>
                  </tr>
                </thead>
                <tbody>
                  {result.unmappedAccounts.map((a) => (
                    <tr key={a.accountCode} className="border-b border-amber-100">
                      <td className="py-1 pr-4 font-mono">{a.accountCode}</td>
                      <td className="py-1 pr-4 text-neutral-700">{a.accountName ?? "—"}</td>
                      <td className={["py-1 text-right tabular-nums", a.totalAmount < 0 ? "text-red-600" : ""].join(" ")}>
                        {formatCurrency(a.totalAmount)}
                      </td>
                      <td className="py-1 pl-4 text-right text-neutral-500">{a.movementCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <a
                href="/admin/mappings"
                className="mt-3 inline-block text-sm text-blue-600 hover:underline"
              >
                → Ir a mappings para asignar cuentas
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
