import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

function trafficLight(diff: number, unmappedAccounts: number, status: string): "green" | "yellow" | "red" {
  if (status === "failed") return "red";
  if (diff > 1000 || status === "processing") return "red";
  if (unmappedAccounts > 0 || diff > 0) return "yellow";
  return "green";
}

const LIGHT_CLASSES = {
  green:  "bg-green-500",
  yellow: "bg-yellow-400",
  red:    "bg-red-500",
};

const STATUS_LABELS: Record<string, string> = {
  processed:  "OK",
  processing: "Procesando",
  failed:     "Error",
  replaced:   "Reemplazado",
};

const STATUS_COLORS: Record<string, string> = {
  processed:  "text-green-700 bg-green-50",
  processing: "text-blue-700 bg-blue-50",
  failed:     "text-red-700 bg-red-50",
  replaced:   "text-neutral-400 bg-neutral-50",
};

function fmt(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

export default async function ControlPage() {
  const rows = await sql`
    SELECT
      c.id                                                       AS company_id,
      c.name                                                     AS company_name,
      uf.id                                                      AS upload_id,
      uf.period_month,
      uf.status,
      uf.original_filename,
      uf.created_at                                              AS uploaded_at,
      uf.row_count,
      uf.total_debit,
      uf.total_credit,
      ABS(COALESCE(uf.total_debit, 0) - COALESCE(uf.total_credit, 0)) AS diff,
      au.full_name                                               AS uploaded_by_name,
      COUNT(DISTINCT CASE WHEN apm.pnl_line_id IS NULL AND je.is_pnl THEN je.account_code END)::int
                                                                 AS unmapped_accounts,
      COALESCE(SUM(CASE WHEN apm.pnl_line_id IS NULL AND je.is_pnl THEN je.amount ELSE 0 END), 0)
                                                                 AS unmapped_amount
    FROM finanzas.companies c
    LEFT JOIN finanzas.uploaded_files uf
      ON uf.company_id = c.id
      AND uf.status IN ('processed', 'processing', 'failed')
    LEFT JOIN finanzas.app_users au
      ON au.id = uf.uploaded_by
    LEFT JOIN finanzas.journal_entries je
      ON je.uploaded_file_id = uf.id
    LEFT JOIN LATERAL (
      SELECT apm2.pnl_line_id
      FROM finanzas.account_pnl_mappings apm2
      WHERE apm2.is_active = TRUE
        AND apm2.account_code = je.account_code
        AND (apm2.company_id = je.company_id OR apm2.company_id IS NULL)
      ORDER BY CASE WHEN apm2.company_id IS NOT NULL THEN 1 ELSE 2 END
      LIMIT 1
    ) apm ON TRUE
    WHERE c.is_active = TRUE
    GROUP BY c.id, c.name, uf.id, au.full_name
    ORDER BY c.name, uf.period_month DESC NULLS LAST
  `;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Control de calidad de datos</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Estado de cargas por empresa y período. Revisar antes de publicar información a directorio.
        </p>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full text-sm border-collapse">
            <thead className="bg-neutral-50 border-b">
              <tr>
                <th className="w-6 px-3 py-2" />
                <th className="px-4 py-2 text-left font-medium text-neutral-600">Empresa</th>
                <th className="px-4 py-2 text-left font-medium text-neutral-600">Período</th>
                <th className="px-4 py-2 text-center font-medium text-neutral-600">Estado</th>
                <th className="px-4 py-2 text-right font-medium text-neutral-600 tabular-nums">Debe</th>
                <th className="px-4 py-2 text-right font-medium text-neutral-600 tabular-nums">Haber</th>
                <th className="px-4 py-2 text-right font-medium text-neutral-600 tabular-nums">Diferencia</th>
                <th className="px-4 py-2 text-right font-medium text-neutral-600">Ctas sin mapear</th>
                <th className="px-4 py-2 text-right font-medium text-neutral-600 tabular-nums">Monto sin mapear</th>
                <th className="px-4 py-2 text-left font-medium text-neutral-600">Última carga</th>
                <th className="px-4 py-2 text-left font-medium text-neutral-600">Usuario</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-neutral-400">
                    No hay datos de cargas registradas.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const status        = (r.upload_id ? r.status : "sin_carga") as string;
                const diff          = Number(r.diff ?? 0);
                const unmapped      = r.unmapped_accounts as number ?? 0;
                const unmappedAmt   = Number(r.unmapped_amount ?? 0);
                const light         = r.upload_id ? trafficLight(diff, unmapped, status) : "red";
                const statusLabel   = r.upload_id ? (STATUS_LABELS[status] ?? status) : "Sin carga";
                const statusColor   = r.upload_id ? (STATUS_COLORS[status] ?? "bg-neutral-100 text-neutral-500") : "text-red-700 bg-red-50";

                return (
                  <tr key={`${r.company_id as string}-${r.upload_id as string ?? "none"}-${r.period_month as string ?? "none"}`}
                      className="border-b hover:bg-neutral-50">
                    <td className="px-3 py-2">
                      <span className={["inline-block w-2.5 h-2.5 rounded-full", LIGHT_CLASSES[light]].join(" ")} />
                    </td>
                    <td className="px-4 py-2 font-medium whitespace-nowrap">{r.company_name as string}</td>
                    <td className="px-4 py-2 text-neutral-600 whitespace-nowrap tabular-nums">
                      {r.period_month ? new Date(r.period_month as string).toISOString().slice(0, 7) : "—"}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={["text-xs px-2 py-0.5 rounded-full font-medium", statusColor].join(" ")}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-600">
                      {r.total_debit != null ? fmt(Number(r.total_debit)) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-600">
                      {r.total_credit != null ? fmt(Number(r.total_credit)) : "—"}
                    </td>
                    <td className={["px-4 py-2 text-right tabular-nums font-medium", diff > 0 ? "text-red-600" : "text-neutral-400"].join(" ")}>
                      {r.upload_id ? fmt(diff) : "—"}
                    </td>
                    <td className={["px-4 py-2 text-right font-medium", unmapped > 0 ? "text-amber-600" : "text-neutral-400"].join(" ")}>
                      {r.upload_id ? unmapped : "—"}
                    </td>
                    <td className={["px-4 py-2 text-right tabular-nums", Math.abs(unmappedAmt) > 0 ? "text-amber-600" : "text-neutral-400"].join(" ")}>
                      {r.upload_id ? fmt(unmappedAmt) : "—"}
                    </td>
                    <td className="px-4 py-2 text-neutral-500 text-xs whitespace-nowrap">
                      {r.uploaded_at ? new Date(r.uploaded_at as string).toLocaleString("es-CL") : "—"}
                    </td>
                    <td className="px-4 py-2 text-neutral-500 text-xs whitespace-nowrap">
                      {r.uploaded_by_name as string ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> OK — balance cuadrado, todas las cuentas mapeadas</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400" /> Advertencia — cuentas sin mapear o diferencia mínima</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Bloqueado — sin carga, diferencia &gt;1.000 o error</span>
      </div>
    </div>
  );
}
