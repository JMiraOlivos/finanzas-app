import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

// Called by GitHub Actions at the end of dbt-run.yml to mark the run as
// completed or failed. Protected by a shared secret — never exposed to users.
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-internal-secret");
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { status?: string; githubRunId?: string; errorMessage?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { status, githubRunId, errorMessage } = body;
  if (status !== "completed" && status !== "failed") {
    return NextResponse.json({ error: "status must be completed or failed" }, { status: 400 });
  }

  // Update the most recent triggered row; ignore if nothing to update
  const result = await sql`
    UPDATE finanzas.dbt_run_history
    SET
      status         = ${status},
      completed_at   = now(),
      error_message  = ${errorMessage ?? null},
      github_run_id  = ${githubRunId ?? null}
    WHERE id = (
      SELECT id FROM finanzas.dbt_run_history
      WHERE status = 'triggered'
      ORDER BY triggered_at DESC
      LIMIT 1
    )
    RETURNING id
  `;

  return NextResponse.json({ updated: result.length > 0 });
}
