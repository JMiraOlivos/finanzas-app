"use client";

import { useEffect, useRef, useState } from "react";

type Company = { id: string; name: string };

type Props = {
  companies: Company[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  loading?: boolean;
};

export function CompanyMultiSelect({ companies, selectedIds, onChange, loading }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const label = loading
    ? "Cargando…"
    : selectedIds.length === 0
    ? "Todas las empresas"
    : selectedIds.length === 1
    ? (companies.find((c) => c.id === selectedIds[0])?.name ?? "1 empresa")
    : `${selectedIds.length} empresas`;

  function toggle(id: string) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading || companies.length === 0}
        className={[
          "border px-3 py-1.5 text-sm font-body flex items-center gap-2 transition-colors",
          "min-w-[160px] max-w-[220px] justify-between disabled:opacity-40",
          selectedIds.length > 0
            ? "border-ev-black text-ev-black"
            : "border-ev-gray6 text-ev-gray3 hover:text-ev-black hover:border-ev-black",
        ].join(" ")}
      >
        <span className="truncate text-left">{label}</span>
        <span className="text-[9px] flex-shrink-0 opacity-60">{open ? "▲" : "▼"}</span>
      </button>

      {open && companies.length > 0 && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-ev-gray6 shadow-lg min-w-[220px] max-h-72 overflow-y-auto">
          {/* Quick actions */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-ev-gray7 sticky top-0 bg-white">
            <button
              onClick={() => { onChange([]); setOpen(false); }}
              className={[
                "text-[10px] font-body transition-colors",
                selectedIds.length === 0 ? "text-ev-black font-semibold" : "text-ev-gray4 hover:text-ev-black",
              ].join(" ")}
            >
              Todas
            </button>
            <button
              onClick={() => onChange(companies.map((c) => c.id))}
              className="text-[10px] font-body text-ev-gray4 hover:text-ev-black transition-colors"
            >
              Seleccionar todas
            </button>
          </div>

          {/* Company list */}
          {companies.map((c) => {
            const checked = selectedIds.includes(c.id);
            return (
              <label
                key={c.id}
                className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-ev-beige2 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(c.id)}
                  className="accent-ev-black w-3.5 h-3.5 flex-shrink-0"
                />
                <span className="text-xs font-body text-ev-gray2 truncate">{c.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
