import { sql } from "@/lib/db";
import { MappingTable } from "@/components/admin/MappingTable";

export const dynamic = "force-dynamic";

export default async function MappingsPage() {
  const [unmapped, pnlLines] = await Promise.all([
    sql`SELECT * FROM finanzas.v_unmapped_pnl_accounts ORDER BY company_name, total_amount DESC NULLS LAST`,
    sql`SELECT id, code, label, level, sort_order, line_type FROM finanzas.pnl_lines WHERE show_in_report = TRUE ORDER BY sort_order`,
  ]);

  return (
    <div className="space-y-6">
      <div className="border border-amber-400 bg-amber-50 px-4 py-3">
        <p className="text-sm font-body text-amber-800 font-semibold">Página de mappings legado</p>
        <p className="text-xs font-body text-amber-700 mt-1">
          Los cambios realizados aquí ya no afectan los reportes. Los mappings activos se gestionan
          en <a href="/admin/pnl-builder" className="underline font-semibold">P&amp;L Builder → Mappings</a> dentro de una versión publicada.
          Esta página permanece solo como referencia histórica.
        </p>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Mapeo de cuentas PnL</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Asigna cada cuenta contable P&L a una línea del Estado de Resultados.
          Las cuentas sin mapping no aparecen en el EERR.
        </p>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <MappingTable
          accounts={unmapped.map((r) => ({
            company_id:     r.company_id as string,
            company_name:   r.company_name as string,
            account_code:   r.account_code as string,
            account_name:   r.account_name as string | null,
            movement_count: r.movement_count as number,
            total_amount:   Number(r.total_amount),
          }))}
          pnlLines={pnlLines.map((r) => ({
            id:        r.id as string,
            code:      r.code as string,
            label:     r.label as string,
            level:     r.level as number,
            sort_order: r.sort_order as number,
            line_type: r.line_type as string,
          }))}
        />
      </div>
    </div>
  );
}
