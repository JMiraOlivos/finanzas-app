"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type Option = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
};

export function SearchableLineSelect({ value, onChange, options, placeholder = "Seleccionar línea…" }: Props) {
  const [open,        setOpen]        = useState(false);
  const [query,       setQuery]       = useState("");
  const containerRef  = useRef<HTMLDivElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  const filtered = query.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.value.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  const handleOpen = useCallback(() => {
    setQuery("");
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleSelect = useCallback((v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  }, [onChange]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full">
      {open ? (
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); setQuery(""); }
            if (e.key === "Enter" && filtered.length === 1) { handleSelect(filtered[0].value); }
          }}
          placeholder="Buscar…"
          className="w-full border border-ev-black px-2 py-1 text-xs font-body focus:outline-none bg-white"
        />
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className="w-full text-left border border-ev-gray6 px-2 py-1 text-xs font-body bg-white hover:border-ev-gray4 focus:outline-none focus:ring-1 focus:ring-ev-black flex items-center justify-between gap-2"
        >
          <span className={value ? "text-ev-black" : "text-ev-gray5"}>
            {value ? selectedLabel : placeholder}
          </span>
          <span className="text-ev-gray5 shrink-0">▾</span>
        </button>
      )}

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-px border border-ev-gray6 bg-white shadow-lg max-h-56 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs font-body text-ev-gray4">Sin resultados</div>
          )}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(o.value); }}
              className={[
                "w-full text-left px-3 py-2 text-xs font-body flex items-baseline gap-2 hover:bg-ev-beige2",
                o.value === value ? "bg-ev-beige2 font-semibold" : "",
              ].join(" ")}
            >
              <span className="text-ev-black">{o.label}</span>
              <span className="text-[10px] font-mono text-ev-gray4 shrink-0">{o.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
