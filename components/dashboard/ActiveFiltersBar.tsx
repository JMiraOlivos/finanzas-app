"use client";

type Props = {
  companyName?: string | null;
  metricLabel?: string | null;
  onClear: () => void;
};

export function ActiveFiltersBar({ companyName, metricLabel, onClear }: Props) {
  const hasFilters = !!(companyName || metricLabel);
  if (!hasFilters) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-ev-beige1 border border-ev-gray6 text-xs font-body text-ev-gray2">
      <span className="text-ev-gray4">Filtros:</span>

      {companyName && (
        <span className="flex items-center gap-1">
          <span className="text-ev-gray4">Empresa</span>
          <span className="font-medium text-ev-black">{companyName}</span>
        </span>
      )}

      {companyName && metricLabel && <span className="text-ev-gray6">·</span>}

      {metricLabel && (
        <span className="flex items-center gap-1">
          <span className="text-ev-gray4">Métrica</span>
          <span className="font-medium text-ev-black">{metricLabel}</span>
        </span>
      )}

      <button
        onClick={onClear}
        className="ml-auto text-ev-gray3 hover:text-ev-black transition-colors underline underline-offset-2"
      >
        Limpiar filtros
      </button>
    </div>
  );
}
