// Triggers the "dbt-run" GitHub Actions workflow after a financial data upload.
// Requires GITHUB_TOKEN (PAT with repo scope) and GITHUB_REPO ("owner/repo") in Vercel env vars.
// Gracefully no-ops in local dev when those vars are not set.
export async function triggerDbtRun(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO;
  if (!token || !repo) return;

  try {
    await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ event_type: "dbt-run" }),
    });
  } catch {
    // Non-critical: upload succeeded; dbt run can be triggered manually if needed
  }
}
