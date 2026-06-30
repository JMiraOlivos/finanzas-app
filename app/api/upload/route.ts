import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { loadJournalFile } from "@/lib/ingest/loadJournal";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  if (!isAdmin(user.role) && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden: only admin or finance can upload files" }, { status: 403 });
  }

  const formData = await request.formData();
  const file      = formData.get("file")      as File | null;
  const companyId = formData.get("companyId") as string | null;
  const period    = formData.get("period")    as string | null;

  if (!file || !companyId) {
    return NextResponse.json({ error: "Missing file or companyId" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const result = await loadJournalFile({
    buffer,
    filename: file.name,
    companyId,
    periodMonth: period ?? undefined,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json(result);
}
