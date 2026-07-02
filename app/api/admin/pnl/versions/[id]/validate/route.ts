import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validatePnlStructure } from "@/lib/pnl/validatePnlStructure";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const result = await validatePnlStructure(id);

  return NextResponse.json(result, {
    status: result.valid ? 200 : 422,
  });
}
