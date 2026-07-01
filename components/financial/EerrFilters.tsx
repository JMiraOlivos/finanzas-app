"use client";

type Company = { id: string; name: string };

export type EerrMode = "ytd" | "lmonth" | "vs_budget" | "vs_ly" | "vs_ly_budget";

type Props = {
  companies: Company[];
  selectedCompanyIds: string[];
  onCompanyChange: (ids: string[]) => void;
  period: string;           // "YYYY-MM-DD"
  onPeriodChange: (p: string) => void;
  mode?: EerrMode;
  onModeChange?: (m: EerrMode) => void;
};

export function EerrFilters({
  companies,
  selectedCompanyIds,
  onCompanyChange,
  period,
  onPeriodChange,
  mode = "ytd",
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
    <div className="flex flex-wrap items-center gap-3 py-3 px-4 border-b border-ev-gray7 bg-ev-beige2">
      {/* Period picker */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-body font-medium text-ev-gray2">Período</label>
        <input
          type="month"
          value={monthValue}
          onChange={handleMonthChange}
          className="text-xs border border-ev-gray6 px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-ev-black"
        />
      </div>

      {/* Mode toggle */}
      {onModeChange && (
        <div className="flex border border-ev-gray6 overflow-hidden text-xs">
          {(["ytd", "lmonth", "vs_budget", "vs_ly", "vs_ly_budget"] as EerrMode[]).map((m, i) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={[
                "px-3 py-1 font-body font-medium",
                i > 0 ? "border-l border-ev-gray6" : "",
                mode === m ? "bg-ev-black text-white" : "bg-white text-ev-gray2 hover:bg-ev-beige2",
              ].join(" ")}
            >
              {m === "ytd"
                ? "YTD"
                : m === "lmonth"
                ? "Mes + YTD"
                : m === "vs_budget"
                ? "vs Ppto."
                : m === "vs_ly"
                ? "vs LY"
                : "vs LY + Ppto"}
            </button>
          ))}
        </div>
      )}

      {/* Company selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-body font-medium text-ev-gray2">Empresas</span>
        <button onClick={selectAll} className="text-xs text-ev-black hover:underline font-body">Todas</button>
        <button onClick={clearAll}  className="text-xs text-ev-gray4 hover:underline font-body">Ninguna</button>
        {companies.map((c) => (
          <button
            key={c.id}
            onClick={() => toggleCompany(c.id)}
            className={[
              "text-xs px-2 py-0.5 border font-body",
              selectedCompanyIds.includes(c.id)
                ? "bg-ev-black text-white border-ev-black"
                : "bg-white text-ev-gray2 border-ev-gray6 hover:bg-ev-beige2",
            ].join(" ")}
          >
            {c.name.replace("E&V ", "")}
          </button>
        ))}
      </div>
    </div>
  );
}
