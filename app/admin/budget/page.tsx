"use client";

import { useEffect, useRef, useState } from "react";

type PnlLine = {
  id: string;
  code: string;
  label: string;
  line_type: string;
  parent_code: string | null;
};

type UploadResult =
  | {
      status: "committed";
      rowCount: number;
      companiesLoaded: string[];
      warnings: string[];
    }
  | {
      status: "pending_mapping";
      versionIds: string[];
      rowCount: number;
      companiesLoaded: string[];
      warnings: string[];
      unmapped: string[];
    };

export default function BudgetPage() {
  const [file,      setFile]      = useState<File | null>(null);
  const [pageStatus, setPageStatus] = useState<"idle" | "uploading" | "mapping" | "saving" | "done" | "error">("idle");
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [pnlLines,  setPnlLines]  = useState<PnlLine[]>([]);
  // accountName → pnlLineId
  const [selections, setSelections] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // Load pnl_lines when entering mapping step
  useEffect(() => {
    if (pageStatus !== "mapping") return;
    fetch("/api/pnl-lines")
      .then((r) => r.json())
      .then((data) => setPnlLines(data as PnlLine[]))
      .catch(() => setError("No se pudieron cargar las líneas P&L"));
  }, [pageStatus]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setPageStatus("uploading");
    setError(null);
    setUploadResult(null);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res  = await fetch("/api/budget", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");

      const result = data as UploadResult;
      setUploadResult(result);

      if (result.status === "pending_mapping") {
        setPageStatus("mapping");
      } else {
        setPageStatus("done");
      }
    } catch (err) {
      setError((err as Error).message);
      setPageStatus("error");
    }
  }

  async function handleSaveMappings(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadResult || uploadResult.status !== "pending_mapping") return;

    const unmapped = uploadResult.unmapped;
    const missing  = unmapped.filter((name) => !selections[name]);
    if (missing.length > 0) {
      setError(`Faltan mapear: ${missing.join(", ")}`);
      return;
    }

    setPageStatus("saving");
    setError(null);

    // Use first versionId — mappings apply to all companies in this upload
    const versionId = uploadResult.versionIds[0];

    // We need companyId per account — fetch from mappings endpoint
    let companyRows: { account_name: string; company_id: string }[] = [];
    try {
      const r = await fetch(`/api/budget/mappings?versionId=${versionId}`);
      companyRows = await r.json();
    } catch {
      setError("Error al obtener datos de staging");
      setPageStatus("mapping");
      return;
    }

    // Build one mapping per (accountName, companyId) pair
    const seen = new Set<string>();
    const mappings: { accountName: string; pnlLineId: string; companyId: string }[] = [];
    for (const row of companyRows) {
      const key = `${row.account_name}|${row.company_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const pnlLineId = selections[row.account_name];
      if (pnlLineId) {
        mappings.push({ accountName: row.account_name, pnlLineId, companyId: row.company_id });
      }
    }

    try {
      const res  = await fetch("/api/budget/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, mappings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar mappings");
      setPageStatus("done");
    } catch (err) {
      setError((err as Error).message);
      setPageStatus("mapping");
    }
  }

  function reset() {
    setFile(null);
    setPageStatus("idle");
    setUploadResult(null);
    setError(null);
    setSelections({});
    setPnlLines([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  const unmapped = uploadResult?.status === "pending_mapping" ? uploadResult.unmapped : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Cargar Presupuesto</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Sube un archivo Excel o CSV con el presupuesto mensual por empresa y cuenta.
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
              <td className="py-1 pr-4 font-mono">cuenta</td>
              <td className="py-1">Comisiones por ventas</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 font-mono">monto</td>
              <td className="py-1">5000000 &nbsp;(positivo = ingreso, negativo = gasto)</td>
            </tr>
          </tbody>
        </table>
        <p className="text-neutral-400 text-xs">
          Las cuentas nuevas se mapean a líneas P&L en el paso siguiente. Los mappings se guardan para cargas futuras.
        </p>
      </div>

      {/* ── Step 1: Upload form ────────────────────────────────────────────── */}
      {(pageStatus === "idle" || pageStatus === "uploading" || pageStatus === "error") && (
        <form onSubmit={handleUpload} className="space-y-4 max-w-lg">
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
              disabled={pageStatus === "uploading" || !file}
              className="px-4 py-2 text-sm font-medium rounded bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pageStatus === "uploading" ? "Procesando…" : "Cargar presupuesto"}
            </button>
          </div>
          {pageStatus === "error" && error && (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <strong>Error:</strong> {error}
            </div>
          )}
        </form>
      )}

      {/* ── Step 2: Mapping ────────────────────────────────────────────────── */}
      {(pageStatus === "mapping" || pageStatus === "saving") && uploadResult?.status === "pending_mapping" && (
        <div className="max-w-2xl space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <h3 className="font-semibold text-amber-800 mb-1">
              {unmapped.length} cuenta{unmapped.length !== 1 ? "s" : ""} sin mapear
            </h3>
            <p className="text-sm text-amber-700">
              Asigna cada cuenta del archivo a una línea del P&L. Este mapping se guardará para futuras cargas.
            </p>
          </div>

          <form onSubmit={handleSaveMappings} className="space-y-3">
            <div className="rounded-xl border bg-white overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-neutral-600">Cuenta en archivo</th>
                    <th className="px-4 py-2 text-left font-medium text-neutral-600">Línea P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {unmapped.map((accountName) => (
                    <tr key={accountName} className="border-b last:border-0 hover:bg-neutral-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-neutral-700 max-w-xs truncate">
                        {accountName}
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          required
                          value={selections[accountName] ?? ""}
                          onChange={(e) =>
                            setSelections((prev) => ({ ...prev, [accountName]: e.target.value }))
                          }
                          className="w-full text-sm border border-neutral-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                        >
                          <option value="">— seleccionar —</option>
                          {pnlLines.map((pl) => (
                            <option key={pl.id} value={pl.id}>
                              {pl.label} ({pl.code})
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && (
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pageStatus === "saving"}
                className="px-4 py-2 text-sm font-medium rounded bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pageStatus === "saving" ? "Guardando…" : "Confirmar mapping y cargar"}
              </button>
              <button
                type="button"
                onClick={reset}
                className="px-4 py-2 text-sm rounded border hover:bg-neutral-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Done ──────────────────────────────────────────────────────────── */}
      {pageStatus === "done" && uploadResult && (
        <div className="max-w-lg space-y-3">
          <div className="rounded-xl border bg-green-50 px-5 py-4">
            <h3 className="font-semibold text-green-800 mb-3">Presupuesto cargado</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <span className="text-neutral-600">Filas procesadas</span>
              <span className="font-medium">{uploadResult.rowCount.toLocaleString("es-CL")}</span>
              <span className="text-neutral-600">Empresas</span>
              <span className="font-medium">{uploadResult.companiesLoaded.join(", ")}</span>
            </div>
          </div>

          {uploadResult.warnings.length > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-5 py-3 space-y-1">
              <p className="text-sm font-medium text-orange-800">
                Advertencias ({uploadResult.warnings.length} filas omitidas)
              </p>
              {uploadResult.warnings.slice(0, 10).map((w, i) => (
                <p key={i} className="text-xs text-orange-700">{w}</p>
              ))}
              {uploadResult.warnings.length > 10 && (
                <p className="text-xs text-orange-500">…y {uploadResult.warnings.length - 10} más</p>
              )}
            </div>
          )}

          <button
            onClick={reset}
            className="px-4 py-2 text-sm rounded border hover:bg-neutral-50"
          >
            Nueva carga
          </button>
        </div>
      )}
    </div>
  );
}
