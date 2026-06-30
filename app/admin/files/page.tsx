import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  processed:  "Procesado",
  processing: "Procesando",
  failed:     "Error",
  uploaded:   "Subido",
  replaced:   "Reemplazado",
};

const STATUS_COLORS: Record<string, string> = {
  processed:  "text-green-700 bg-green-50",
  processing: "text-blue-700 bg-blue-50",
  failed:     "text-red-700 bg-red-50",
  uploaded:   "text-neutral-700 bg-neutral-100",
  replaced:   "text-neutral-400 bg-neutral-50",
};

export default async function FilesPage() {
  const files = await sql`
    SELECT
      uf.id, uf.original_filename, uf.period_month, uf.status,
      uf.row_count, uf.total_debit, uf.total_credit, uf.error_message,
      uf.created_at, c.name AS company_name
    FROM finanzas.uploaded_files uf
    JOIN finanzas.companies c ON c.id = uf.company_id
    ORDER BY uf.created_at DESC
    LIMIT 200
  `;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Historial de cargas</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Registro de todos los archivos procesados.
        </p>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full text-sm border-collapse">
            <thead className="bg-neutral-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-neutral-600">Empresa</th>
                <th className="px-4 py-2 text-left font-medium text-neutral-600">Archivo</th>
                <th className="px-4 py-2 text-left font-medium text-neutral-600">Período</th>
                <th className="px-4 py-2 text-center font-medium text-neutral-600">Estado</th>
                <th className="px-4 py-2 text-right font-medium text-neutral-600 tabular-nums">Filas</th>
                <th className="px-4 py-2 text-left font-medium text-neutral-600">Fecha carga</th>
                <th className="px-4 py-2 text-left font-medium text-neutral-600">Error</th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                    No hay archivos cargados aún.
                  </td>
                </tr>
              )}
              {files.map((f) => {
                const status = f.status as string;
                return (
                  <tr key={f.id as string} className="border-b hover:bg-neutral-50">
                    <td className="px-4 py-2 whitespace-nowrap">{f.company_name as string}</td>
                    <td className="px-4 py-2 text-neutral-600 max-w-[200px] truncate" title={f.original_filename as string}>
                      {f.original_filename as string}
                    </td>
                    <td className="px-4 py-2 text-neutral-600 whitespace-nowrap">
                      {f.period_month ? new Date(f.period_month as string).toISOString().slice(0, 7) : "—"}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={["text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[status] ?? "bg-neutral-100 text-neutral-500"].join(" ")}>
                        {STATUS_LABELS[status] ?? status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-600">
                      {f.row_count != null ? (f.row_count as number).toLocaleString("es-CL") : "—"}
                    </td>
                    <td className="px-4 py-2 text-neutral-500 text-xs whitespace-nowrap">
                      {new Date(f.created_at as string).toLocaleString("es-CL")}
                    </td>
                    <td className="px-4 py-2 text-red-600 text-xs max-w-[200px] truncate" title={f.error_message as string ?? ""}>
                      {f.error_message as string ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
