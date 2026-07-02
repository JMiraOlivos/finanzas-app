import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";

const MODEL = "claude-sonnet-4-6";

type Body = {
  accountCode: string;
  accountName: string | null;
  versionId:   string;
};

type SuggestionResponse = {
  pnlLineCode:  string;
  lineLabel:    string;
  explanation:  string;
  confidence:   "high" | "medium" | "low";
};

type AiJson = {
  pnlLineCode:  string;
  explanation:  string;
  confidence:   "high" | "medium" | "low";
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "admin" && user.role !== "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "REPLACE_WITH_API_KEY") {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
  }

  const body = await request.json() as Body;
  const { accountCode, accountName, versionId } = body;
  if (!accountCode?.trim() || !versionId?.trim()) {
    return NextResponse.json({ error: "accountCode y versionId son requeridos" }, { status: 400 });
  }

  // Fetch active detail lines for this version to give Claude the options
  const lineRows = await sql`
    SELECT code, label, level, parent_code
    FROM finanzas.pnl_lines_versioned
    WHERE structure_version_id = ${versionId}::uuid
      AND is_active = true
      AND line_type = 'detail'
    ORDER BY sort_order
  `;

  if (lineRows.length === 0) {
    return NextResponse.json(
      { error: "Esta versión no tiene líneas de detalle activas" },
      { status: 422 }
    );
  }

  const linesText = lineRows
    .map((l) => `  [${l.code}] ${"  ".repeat(Number(l.level) - 1)}${l.label}`)
    .join("\n");

  const prompt = `Eres un asistente de contabilidad de Engel & Völkers Chile, empresa de corretaje inmobiliario de lujo.
Tu tarea es sugerir a cuál línea del Estado de Resultados (P&L) debe asignarse una cuenta del libro mayor.

LÍNEAS P&L DISPONIBLES (solo líneas de detalle — usa exactamente estos códigos):
${linesText}

CUENTA A CLASIFICAR:
Código: ${accountCode}
Nombre: ${accountName ?? "(sin nombre)"}

Responde ÚNICAMENTE con JSON válido, sin texto adicional ni markdown:
{
  "pnlLineCode": "el código exacto de la línea más apropiada",
  "explanation": "una frase breve en español explicando por qué (máx 100 caracteres)",
  "confidence": "high" | "medium" | "low"
}`;

  const client = new Anthropic({ apiKey });
  let aiJson: AiJson;

  try {
    const msg = await client.messages.create({
      model:      MODEL,
      max_tokens: 256,
      messages:   [{ role: "user", content: prompt }],
    });

    const raw     = msg.content[0].type === "text" ? msg.content[0].text : "{}";
    const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    aiJson = JSON.parse(cleaned) as AiJson;
  } catch {
    return NextResponse.json({ error: "Error al interpretar respuesta de IA" }, { status: 500 });
  }

  // Validate the suggested code is actually in the list
  const matched = lineRows.find((l) => l.code === aiJson.pnlLineCode);
  if (!matched) {
    return NextResponse.json(
      { error: `IA sugirió código desconocido: ${aiJson.pnlLineCode}` },
      { status: 422 }
    );
  }

  const result: SuggestionResponse = {
    pnlLineCode: aiJson.pnlLineCode,
    lineLabel:   matched.label as string,
    explanation: aiJson.explanation ?? "",
    confidence:  aiJson.confidence ?? "medium",
  };

  return NextResponse.json(result);
}
