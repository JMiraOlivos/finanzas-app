"use client";

import { useState } from "react";
import { PnlVersionList } from "@/components/admin/pnl/PnlVersionList";
import { PnlStructureEditor } from "@/components/admin/pnl/PnlStructureEditor";

type Tab = "versions" | "structure";

type SelectedVersion = {
  id: string;
  name: string;
  status: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft:     "Borrador",
  published: "Publicado",
  archived:  "Archivado",
};
const STATUS_COLORS: Record<string, string> = {
  draft:     "border-ev-gray5 text-ev-gray3",
  published: "border-ev-green text-ev-green bg-green-50",
  archived:  "border-ev-gray6 text-ev-gray5",
};

export default function PnlBuilderPage() {
  const [tab,             setTab]             = useState<Tab>("versions");
  const [selectedVersion, setSelectedVersion] = useState<SelectedVersion | null>(null);

  function handleSelectVersion(v: SelectedVersion) {
    setSelectedVersion(v);
    setTab("structure");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-head text-ev-black">P&amp;L Builder</h1>
        <p className="text-xs font-body uppercase tracking-[0.1em] text-ev-gray3 mt-1">
          Gestión de versiones y estructura del Estado de Resultados
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-ev-gray7">
        <button
          onClick={() => setTab("versions")}
          className={[
            "px-5 py-2.5 text-xs font-body uppercase tracking-[0.1em] border-b-2 transition-colors",
            tab === "versions"
              ? "border-ev-black text-ev-black"
              : "border-transparent text-ev-gray4 hover:text-ev-black",
          ].join(" ")}
        >
          Versiones
        </button>
        <button
          onClick={() => setTab("structure")}
          className={[
            "px-5 py-2.5 text-xs font-body uppercase tracking-[0.1em] border-b-2 transition-colors",
            tab === "structure"
              ? "border-ev-black text-ev-black"
              : "border-transparent text-ev-gray4 hover:text-ev-black",
          ].join(" ")}
        >
          Estructura
          {selectedVersion && (
            <span className="ml-2 text-[10px] normal-case tracking-normal text-ev-gray4">
              — {selectedVersion.name}
            </span>
          )}
        </button>
      </div>

      {/* Tab: Versiones */}
      {tab === "versions" && (
        <PnlVersionList onSelectVersion={handleSelectVersion} />
      )}

      {/* Tab: Estructura */}
      {tab === "structure" && (
        <>
          {!selectedVersion ? (
            <div className="py-16 text-center text-sm font-body text-ev-gray3">
              Selecciona una versión en la pestaña «Versiones» para ver su estructura.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-head text-ev-black">{selectedVersion.name}</h2>
                <span className={`text-[10px] font-body uppercase tracking-wider px-2 py-0.5 border ${STATUS_COLORS[selectedVersion.status]}`}>
                  {STATUS_LABELS[selectedVersion.status] ?? selectedVersion.status}
                </span>
                <button
                  onClick={() => setTab("versions")}
                  className="ml-auto text-xs font-body text-ev-gray4 hover:text-ev-black underline"
                >
                  ← Cambiar versión
                </button>
              </div>
              <PnlStructureEditor version={selectedVersion} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
