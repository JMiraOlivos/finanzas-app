import Anthropic from "@anthropic-ai/sdk";
import type { FinancialContextPack, PeriodSummaryResponse, AiFinding, AiAction } from "./types";
import { ANALYST_SYSTEM_PROMPT_V1, CFO_SYSTEM_PROMPT_V1, CURRENT_PROMPT_VERSION } from "./prompts";
import { summarizeKpis, summarizeBullets, summarizeDrivers, summarizeDataQuality, summarizeFreshness } from "./formatters";

const MODEL = "claude-sonnet-4-6";

type AnalystJSON = {
  headline: string;
  findings: AiFinding[];
  risks: AiFinding[];
  recommendedActions: AiAction[];
  dataQualityCaveats: string[];
};

export function buildContextText(pack: FinancialContextPack): string {
  const periodDate  = new Date(pack.scope.period + "T12:00:00Z");
  const periodLabel = periodDate.toLocaleDateString("es-CL", { month: "long", year: "numeric" });

  const lines: string[] = [
    `=== DATOS FINANCIEROS — ${periodLabel.toUpperCase()} ===`,
    pack.scope.companyIds
      ? `\nALCANCE: ${pack.scope.companyIds.length} empresa(s) seleccionada(s)`
      : `\nALCANCE: Todas las empresas del grupo`,
    `\nKPIs CONSOLIDADOS:\n${summarizeKpis(pack.kpis)}`,
  ];

  if (pack.bullets.length > 0) {
    lines.push(`\nCUMPLIMIENTO POR EMPRESA (semáforo real=verde/azul, riesgo=rojo/amarillo):\n${summarizeBullets(pack.bullets)}`);
  }

  if (pack.topDriversBudget.length > 0) {
    lines.push(`\nPRINCIPALES DESVIACIONES VS PRESUPUESTO (top impacto):\n${summarizeDrivers(pack.topDriversBudget, "budget")}`);
  }

  if (pack.topDriversLy.length > 0) {
    lines.push(`\nPRINCIPALES DESVIACIONES VS AÑO ANTERIOR:\n${summarizeDrivers(pack.topDriversLy, "ly")}`);
  }

  if (pack.dataQuality.length > 0) {
    lines.push(`\nCALIDAD DE DATOS:\n${summarizeDataQuality(pack.dataQuality)}`);
  }

  if (pack.periodCloses.length > 0) {
    const closes = pack.periodCloses.map((c) => `${c.companyName}: ${c.status}`).join("\n");
    lines.push(`\nESTADO DE CIERRES:\n${closes}`);
  }

  if (pack.comments.length > 0) {
    const comments = pack.comments.slice(0, 5).map((c) => `- ${c.body}`).join("\n");
    lines.push(`\nCOMENTARIOS REGISTRADOS:\n${comments}`);
  }

  lines.push(`\nFRESCURA DE DATOS: ${summarizeFreshness(pack.dbtFreshness)}`);

  return lines.join("\n");
}

function parsePeriodLabel(period: string): string {
  const d = new Date(period + "T12:00:00Z");
  return d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

function safeParseAnalyst(text: string): AnalystJSON {
  try {
    // Strip possible markdown fences
    const cleaned = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<AnalystJSON>;
    return {
      headline:             parsed.headline ?? "Análisis del período",
      findings:             Array.isArray(parsed.findings)           ? parsed.findings           : [],
      risks:                Array.isArray(parsed.risks)              ? parsed.risks              : [],
      recommendedActions:   Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [],
      dataQualityCaveats:   Array.isArray(parsed.dataQualityCaveats) ? parsed.dataQualityCaveats : [],
    };
  } catch {
    return {
      headline:           "Análisis del período",
      findings:           [],
      risks:              [],
      recommendedActions: [],
      dataQualityCaveats: ["No fue posible estructurar el análisis correctamente."],
    };
  }
}

export async function runFinancialAnalysis(pack: FinancialContextPack): Promise<PeriodSummaryResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "REPLACE_WITH_API_KEY") {
    throw new Error("ANTHROPIC_API_KEY no configurada");
  }

  const client      = new Anthropic({ apiKey });
  const contextText = buildContextText(pack);

  // ── Pass 1: Analyst ────────────────────────────────────────────────────
  const analystMsg = await client.messages.create({
    model:      MODEL,
    max_tokens: 2000,
    system:     ANALYST_SYSTEM_PROMPT_V1,
    messages:   [{ role: "user", content: contextText }],
  });

  const analystText   = analystMsg.content[0].type === "text" ? analystMsg.content[0].text : "{}";
  const analystResult = safeParseAnalyst(analystText);

  // ── Pass 2: CFO narrative ──────────────────────────────────────────────
  const cfoInput = [
    contextText,
    "\n\n=== ANÁLISIS DEL ANALISTA ===",
    JSON.stringify(analystResult, null, 2),
    "\n\nRedacta el resumen ejecutivo para el directorio:",
  ].join("\n");

  const cfoMsg = await client.messages.create({
    model:      MODEL,
    max_tokens: 800,
    system:     CFO_SYSTEM_PROMPT_V1,
    messages:   [{ role: "user", content: cfoInput }],
  });

  const executiveSummary = cfoMsg.content[0].type === "text"
    ? cfoMsg.content[0].text.trim()
    : "No fue posible generar el resumen ejecutivo.";

  return {
    headline:           analystResult.headline,
    executiveSummary,
    findings:           analystResult.findings,
    risks:              analystResult.risks,
    recommendedActions: analystResult.recommendedActions,
    dataQualityCaveats: analystResult.dataQualityCaveats,
    periodLabel:        parsePeriodLabel(pack.scope.period),
    modelName:          MODEL,
    promptVersion:      CURRENT_PROMPT_VERSION,
    generatedAt:        new Date().toISOString(),
  };
}
