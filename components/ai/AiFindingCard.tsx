"use client";

import type { AiFinding } from "@/lib/ai/types";

const SEVERITY_BADGE: Record<AiFinding["severity"], string> = {
  high:   "bg-red-100 text-ev-red",
  medium: "bg-yellow-100 text-yellow-700",
  low:    "bg-neutral-100 text-ev-gray3",
};

const SEVERITY_LABEL: Record<AiFinding["severity"], string> = {
  high:   "Alta",
  medium: "Media",
  low:    "Baja",
};

type Props = { finding: AiFinding };

export function AiFindingCard({ finding }: Props) {
  return (
    <div className="border border-ev-gray7 p-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={["text-[9px] font-body font-semibold px-1.5 py-0.5 uppercase tracking-wider", SEVERITY_BADGE[finding.severity]].join(" ")}>
          {SEVERITY_LABEL[finding.severity]}
        </span>
        <span className="text-[10px] font-body text-ev-gray4 uppercase tracking-wider">{finding.category}</span>
      </div>
      <p className="text-xs font-body font-semibold text-ev-black">{finding.title}</p>
      <p className="text-[11px] font-body text-ev-gray2 leading-relaxed">{finding.detail}</p>
    </div>
  );
}
