"use client";

import type { AiAction } from "@/lib/ai/types";

const PRIORITY_DOT: Record<AiAction["priority"], string> = {
  high:   "bg-ev-red",
  medium: "bg-yellow-400",
  low:    "bg-ev-gray5",
};

type Props = { actions: AiAction[] };

export function AiRecommendedActions({ actions }: Props) {
  if (actions.length === 0) return null;
  return (
    <ol className="space-y-2">
      {actions.map((a, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className={["mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0", PRIORITY_DOT[a.priority]].join(" ")} />
          <div>
            <span className="text-xs font-body text-ev-black">{a.action}</span>
            {a.owner && (
              <span className="ml-1.5 text-[10px] font-body text-ev-gray4">— {a.owner}</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
