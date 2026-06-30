import { sql } from "@/lib/db";
import { UploadPanel } from "@/components/admin/UploadPanel";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const companies = await sql`
    SELECT id, name FROM finanzas.companies WHERE is_active = TRUE ORDER BY name
  `;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Cargar libro diario</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Sube un archivo Excel (.xls o .xlsx) con los movimientos contables de una empresa.
        </p>
      </div>

      <UploadPanel
        companies={companies.map((c) => ({ id: c.id as string, name: c.name as string }))}
      />
    </div>
  );
}
