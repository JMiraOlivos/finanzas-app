"use client";

import { useEffect, useState } from "react";

type DbtStatus = {
  triggeredAt: string;
  triggerSource: string;
  status: "triggered" | "completed" | "failed";
  completedAt: string | null;
  errorMessage: string | null;
  githubRunId: string | null;
};

function minutesAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

function label(run: DbtStatus): { text: string; dot: string } {
  if (run.status === "failed") {
    return { text: "Último refresh falló", dot: "bg-ev-red" };
  }
  if (run.status === "triggered") {
    return { text: "Actualizando marts…", dot: "bg-yellow-400 animate-pulse" };
  }
  // completed
  const ref = run.completedAt ?? run.triggeredAt;
  const mins = minutesAgo(ref);
  if (mins < 60) {
    const stale = mins > 720; // > 12h without refresh = warn
    return {
      text: mins < 2 ? "Marts al día" : `Marts hace ${mins} min`,
      dot: stale ? "bg-yellow-400" : "bg-ev-green",
    };
  }
  const hrs = Math.floor(mins / 60);
  return {
    text: `Marts hace ${hrs}h`,
    dot: hrs > 24 ? "bg-yellow-400" : "bg-ev-green",
  };
}

export function DataFreshnessBadge() {
  const [run, setRun] = useState<DbtStatus | null>(null);

  useEffect(() => {
    fetch("/api/admin/dbt-status")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { if (d.lastRun) setRun(d.lastRun); })
      .catch(() => {}); // badge is optional — silently hide on error or non-admin
  }, []);

  if (!run) return null;

  const { text, dot } = label(run);

  return (
    <span className="flex items-center gap-1.5 text-[10px] font-body text-ev-gray4">
      <span className={["w-1.5 h-1.5 rounded-full shrink-0", dot].join(" ")} />
      {text}
    </span>
  );
}
