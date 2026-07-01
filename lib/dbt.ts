// Triggers the "dbt-run" GitHub Actions workflow after a financial data upload.
// Requires GITHUB_TOKEN (PAT with repo scope) and GITHUB_REPO ("owner/repo") in Vercel env vars.
// Gracefully no-ops in local dev when those vars are not set.
import { sql } from "@/lib/db";

export async function triggerDbtRun(source: string = "upload"): Promise<void> {
  // Record trigger in DB so the control dashboard can show last refresh time.
  try {
    await sql`INSERT INTO finanzas.dbt_run_history (trigger_source) VALUES (${source})`;
  } catch (err) {
    console.error("dbt_run_history insert failed:", err);
  }

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO;
  if (!token || !repo) return;

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ event_type: "dbt-run" }),
    });
    if (!res.ok) {
      console.error(`dbt dispatch failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("dbt dispatch error:", err);
  }
}
