import { json, validatePublicPost } from "../_lib/assistant/security.js";
import {
  buildFallbackAssistantResponse,
  cleanText,
  mergeAssistantSalesContext,
  sanitizeAssistantSalesContext,
} from "../_lib/assistant/engine.js";
import { buildAssistantSalesInstructions } from "../_lib/assistant/prompt.js";
import { buildAssistantResponseSchema, parseAssistantModelOutput } from "../_lib/assistant/responseSchema.js";
import type { AssistantChatMessage } from "../_lib/assistant/types.js";

// Web-standard Request/Response works on Vercel's default Node.js runtime
// for non-Next.js projects (named per-HTTP-method exports) — confirmed via
// Vercel's Functions API reference, no edge runtime needed.
export const config = { runtime: "nodejs", maxDuration: 35 };

const OFF_TOPIC_REDIRECT = {
  message:
    "Dabei kann ich leider nicht helfen – mein Fokus liegt auf digitalen Räumen und Standorten. Was möchtest du bei euch als Nächstes erreichen?",
  quickReplies: ["Verkaufsfläche digitalisieren", "Mehrere Standorte steuern", "Noch nicht sicher"],
};

function cleanHistory(value: unknown): AssistantChatMessage[] {
  if (!Array.isArray(value)) return [];
  const cleaned: AssistantChatMessage[] = [];
  let totalLength = 0;
  for (const entry of value.slice(-10)) {
    if (!entry || typeof entry !== "object") continue;
    const role = (entry as Record<string, unknown>).role;
    const content = cleanText((entry as Record<string, unknown>).content, 1600);
    if ((role !== "user" && role !== "assistant") || !content) continue;
    cleaned.push({ role, content });
    totalLength += content.length;
  }
  if (totalLength > 12_000) return [];
  return cleaned;
}

function outputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  if (!Array.isArray(record.output)) return null;
  const parts: string[] = [];
  for (const item of record.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const chunk of content) {
      if (chunk && typeof chunk === "object" && typeof (chunk as Record<string, unknown>).text === "string") {
        parts.push((chunk as Record<string, unknown>).text as string);
      }
    }
  }
  return parts.length > 0 ? parts.join("") : null;
}

export async function POST(request: Request): Promise<Response> {
  const guardError = validatePublicPost(request, {
    key: "assistant-chat",
    limit: 12,
    windowMs: 60_000,
    contentTypes: ["application/json"],
    maxBytes: 32_000,
  });
  if (guardError) return guardError;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: "Assistant ist momentan nicht verfügbar." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Ungültiger Anfrage-Body." }, { status: 400 });
  }

  const message = cleanText(body.message, 1200);
  if (!message) {
    return json({ error: "Nachricht fehlt." }, { status: 400 });
  }
  const sectionId = cleanText(body.sectionId, 80) || "hero";
  const history = cleanHistory(body.history);
  const currentContext = sanitizeAssistantSalesContext(body.context);
  const validFurnishingIds = currentContext.showroomManifest?.furnishings?.map((item) => item.id) ?? [];
  const validWallIds = currentContext.showroomManifest?.displayWalls?.map((item) => item.wall) ?? [];
  const responseSchema = buildAssistantResponseSchema(validFurnishingIds, validWallIds);

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_ASSISTANT_MODEL || "gpt-5.6-terra",
        instructions: buildAssistantSalesInstructions({ sectionId, context: currentContext }),
        input: [...history, { role: "user", content: message }],
        max_output_tokens: 1200,
        // Was "low" — live-tested and the model reliably chose not to act
        // on the new wallDisplays capability (asking follow-up questions
        // instead), even after several rounds of prompt tuning, most
        // likely because "low" left too little budget to juggle it
        // alongside the existing off-topic/context/furnishings/structures
        // rules. "medium" trades some latency/cost for reliability.
        reasoning: { effort: process.env.OPENAI_ASSISTANT_REASONING_EFFORT || "medium" },
        text: {
          format: {
            type: "json_schema",
            name: "assistant_sales_response",
            strict: true,
            schema: responseSchema,
          },
        },
        store: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    console.error("assistant/chat: OpenAI request failed", error);
    return json({ ...buildFallbackAssistantResponse(currentContext), degraded: true });
  }

  if (!response.ok) {
    console.error("assistant/chat: OpenAI responded with", response.status, await response.text().catch(() => ""));
    return json({ ...buildFallbackAssistantResponse(currentContext), degraded: true });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return json({ ...buildFallbackAssistantResponse(currentContext), degraded: true });
  }

  const rawText = outputText(payload);
  let parsedJson: unknown = null;
  if (rawText) {
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      parsedJson = null;
    }
  }

  const parsed = parseAssistantModelOutput(parsedJson, validFurnishingIds, validWallIds);
  if (!parsed) {
    return json({ ...buildFallbackAssistantResponse(currentContext), degraded: true });
  }

  if (parsed.scope === "off_topic") {
    return json({
      answer: OFF_TOPIC_REDIRECT.message,
      message: OFF_TOPIC_REDIRECT.message,
      context: currentContext,
      recommendation: null,
      uiActions: [],
      animationState: "speaking",
      quickReplies: OFF_TOPIC_REDIRECT.quickReplies,
      shouldHandover: false,
    });
  }

  const mergedContext = mergeAssistantSalesContext(currentContext, {
    ...parsed.extractedContext,
    currentStage: parsed.stage,
    nextBestAction: parsed.nextBestAction,
    recommendedServices: parsed.recommendation?.services.map((service) => service.serviceId) ??
      (parsed.extractedContext as Record<string, unknown>).recommendedServices,
  });

  const uiActions = parsed.recommendation
    ? parsed.uiActions
    : parsed.uiActions.filter((action) => action.type !== "SHOW_SOLUTION" && action.type !== "SHOW_RECOMMENDATION");

  const hasShowroomConcept = uiActions.some((action) => action.type === "SHOWROOM_APPLY_CONCEPT");
  const animationState = parsed.recommendation || hasShowroomConcept ? "presenting" : parsed.animationState;

  return json({
    answer: parsed.message,
    message: parsed.message,
    context: mergedContext,
    recommendation: parsed.recommendation ?? null,
    uiActions,
    animationState,
    quickReplies: parsed.quickReplies,
    shouldHandover: parsed.shouldHandover || mergedContext.currentStage === "handover",
  });
}
