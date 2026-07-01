import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadForecastFile } from "@/lib/ingest/loadForecast";
import { triggerDbtRun } from "@/lib/dbt";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await loadForecastFile({ buffer, filename: file.name, uploadedBy: user.id });

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 422 });
  void triggerDbtRun();
  return NextResponse.json(result);
}
