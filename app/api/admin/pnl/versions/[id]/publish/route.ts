import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { publishPnlStructureVersion } from "@/lib/pnl/publishPnlStructureVersion";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };

  // Only admin can publish — finance can edit drafts but not promote to active
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores pueden publicar una versión" }, { status: 403 });
  }

  const { id } = await params;
  const result = await publishPnlStructureVersion(id, user.id);

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
    }
    if (result.reason === "not_draft") {
      return NextResponse.json({ error: "Solo se pueden publicar versiones en estado borrador" }, { status: 409 });
    }
    if (result.reason === "validation_failed") {
      return NextResponse.json(
        { error: "La versión tiene errores estructurales que deben corregirse antes de publicar", errors: result.errors },
        { status: 422 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}
