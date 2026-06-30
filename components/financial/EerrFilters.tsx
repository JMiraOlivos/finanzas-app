"use client";

type Company = { id: string; name: string };

type Props = {
  companies: Company[];
  selectedCompanyIds: string[];
  onCompanyChange: (ids: string[]) => void;
  period: string;           // "YYYY-MM-DD"
  onPeriodChange: (p: string) => void;
  mode?: "ytd" | "lmonth";
  onModeChange?: (m: "ytd" | "lmonth") => void;
};

export function EerrFilters({
  companies,
  selectedCompanyIds,
  onCompanyChange,
  period,
  onPeriodChange,
  mode,
  onModeChange,
}: Props) {
  function toggleCompany(id: string) {
    if (selectedCompanyIds.includes(id)) {
      onCompanyChange(selectedCompanyIds.filter((c) => c !== id));
    } else {
      onCompanyChange([...selectedCompanyIds, id]);
    }
  }

  function selectAll() {
    onCompanyChange(companies.map((c) => c.id));
  }

  function clearAll() {
    onCompanyChange([]);
  }

  // Convert "YYYY-MM-DD" → "YYYY-MM" for the input
  const monthValue = period.slice(0, 7);

  function handleMonthChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value; // "YYYY-MM"
    if (!v) return;
    // Set to last day of selected month
    const [y, m] = v.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    onPeriodChange(`${v}-${String(lastDay).padStart(2, "0")}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-3 px-4 border-b bg-neutral-50">
      {/* Period picker */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-neutral-600">Período</label>
        <input
          type="month"
          value={monthValue}
          onChange={handleMonthChange}
          className="text-xs border rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
        />
      </div>

      {/* Mode toggle */}
      {onModeChange && (
        <div className="flex rounded border overflow-hidden text-xs">
          <button
            onClick={() => onModeChange("ytd")}
            className={["px-3 py-1 font-medium", mode === "ytd" ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"].join(" ")}
          >
            YTD
          </button>
          <button
            onClick={() => onModeChange("lmonth")}
            className={["px-3 py-1 font-medium border-l", mode === "lmonth" ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"].join(" ")}
          >
            Mes + YTD
          </button>
        </div>
      )}

      {/* Company selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-neutral-600">Empresas</span>
        <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">Todas</button>
        <button onClick={clearAll}  className="text-xs text-neutral-400 hover:underline">Ninguna</button>
        {companies.map((c) => (
          <button
            key={c.id}
            onClick={() => toggleCompany(c.id)}
            className={[
              "text-xs px-2 py-0.5 rounded border",
              selectedCompanyIds.includes(c.id)
                ? "bg-neutral-900 text-white border-neutral-900"
                : "bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50",
            ].join(" ")}
          >
            {c.name.replace("E&V ", "")}
          </button>
        ))}
      </div>
    </div>
  );
}
