import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getAllowedCompanyIds } from "@/lib/permissions";
import { CHAT_SYSTEM_PROMPT_V1, CURRENT_PROMPT_VERSION } from "@/lib/ai/prompts";
import { CHAT_TOOLS, executeTool, type ToolContext } from "@/lib/ai/tools";

const MODEL   = "claude-sonnet-4-6";
const MAX_ITER = 6;

type HistoryMessage = { role: "user" | "assistant"; content: string };

type Body = {
  message: string;
  threadId?: string | null;
  period: string;
  companyIds?: string[] | null;
  history?: HistoryMessage[];
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "REPLACE_WITH_API_KEY") {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, period, history = [] } = body;
  if (!message?.trim() || !period) {
    return NextResponse.json({ error: "message and period are required" }, { status: 400 });
  }

  // Resolve effective scope
  const allowedIds = await getAllowedCompanyIds(user.id, user.role);
  let effectiveIds: string[] | null = allowedIds;
  if (body.companyIds) {
    effectiveIds = allowedIds === null
      ? body.companyIds
      : body.companyIds.filter((id) => allowedIds.includes(id));
  }

  const periodDate  = new Date(period + "T12:00:00Z");
  const periodLabel = periodDate.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  const scopeLabel  = effectiveIds
    ? `${effectiveIds.length} empresa(s) seleccionada(s)`
    : "Todas las empresas del grupo";

  const toolCtx: ToolContext = { period, effectiveIds, periodLabel };

  // System prompt with injected context
  const systemPrompt = [
    CHAT_SYSTEM_PROMPT_V1,
    `\nCONTEXTO DE LA SESIÓN:`,
    `- Período analizado: ${periodLabel} (${period})`,
    `- Empresas en scope: ${scopeLabel}`,
  ].join("\n");

  // Build messages: history text + new user message
  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.content } as Anthropic.MessageParam)),
    { role: "user", content: message },
  ];

  const client = new Anthropic({ apiKey });

  // ── Agentic tool-calling loop ───────────────────────────────────────────
  let finalText = "";
  let iter = 0;

  while (iter < MAX_ITER) {
    iter++;
    const response = await client.messages.create({
      model:      MODEL,
      max_tokens: 1500,
      system:     systemPrompt,
      tools:      CHAT_TOOLS,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      break;
    }

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      // Execute all tool calls in parallel
      const results = await Promise.all(
        toolUseBlocks.map(async (tu) => ({
          type:        "tool_result" as const,
          tool_use_id: tu.id,
          content:     await executeTool(tu.name, tu.input as Record<string, unknown>, toolCtx),
        }))
      );

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user",      content: results });
      continue;
    }

    // Unexpected stop reason — extract any text we have
    finalText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    break;
  }

  if (!finalText) {
    finalText = "No pude generar una respuesta. Por favor intenta de nuevo.";
  }

  // ── Persist thread + messages ────────────────────────────────────────────
  let threadId = body.threadId ?? null;
  const periodMonth = period.slice(0, 7) + "-01";

  try {
    if (!threadId) {
      const [row] = await sql`
        INSERT INTO finanzas.ai_chat_threads (user_id, title, period)
        VALUES (${user.id}::uuid, ${message.slice(0, 80)}, ${periodMonth}::date)
        RETURNING id
      `;
      threadId = String(row.id);
    } else {
      await sql`
        UPDATE finanzas.ai_chat_threads SET updated_at = now() WHERE id = ${threadId}::uuid
      `;
    }

    await sql`
      INSERT INTO finanzas.ai_chat_messages (thread_id, role, content)
      VALUES
        (${threadId}::uuid, 'user',      ${message}),
        (${threadId}::uuid, 'assistant', ${finalText})
    `;
  } catch { /* persistence failure must not break the response */ }

  void logAudit({
    userId:   user.id,
    action:   "ai_chat",
    metadata: { period, iterations: iter, model: MODEL, promptVersion: CURRENT_PROMPT_VERSION },
  });

  return NextResponse.json({ reply: finalText, threadId });
}
