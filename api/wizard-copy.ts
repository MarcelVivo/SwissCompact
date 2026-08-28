import { json, validatePublicPost, cleanText } from "./_lib/assistant/security.js";

// Focused, stateless sibling to api/assistant/chat.ts — deliberately does
// NOT go through the sales-engine pipeline (no AssistantSalesContext, no
// stage machinery, no off-topic gate). The showroom wizard already knows
// exactly what it's asking; this just turns one short description into
// display copy, fast.
export const config = { runtime: "nodejs", maxDuration: 30 };

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "offerText", "priceText"],
  properties: {
    title: { type: "string" },
    offerText: { type: "string" },
    priceText: { type: ["string", "null"] },
  },
} as const;

function text(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

export async function POST(request: Request): Promise<Response> {
  const guardError = validatePublicPost(request, {
    key: "wizard-copy",
    limit: 15,
    windowMs: 10 * 60_000,
    contentTypes: ["application/json"],
    maxBytes: 4_000,
  });
  if (guardError) return guardError;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: "Textvorschlag momentan nicht verfügbar." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Ungültiger Anfrage-Body." }, { status: 400 });
  }

  const description = cleanText(body.description, 400);
  if (!description) {
    return json({ error: "Beschreibung fehlt." }, { status: 400 });
  }
  const businessType = cleanText(body.businessType, 80) || "";
  const roomPreset = cleanText(body.roomPreset, 60) || "raum";

  const instructions = `Du schreibst kurzen, deutschen Text für ein Digital-Signage-Display in einem Raum vom Typ "${roomPreset}"${
    businessType ? ` (Geschäftsart: ${businessType})` : ""
  }. Basierend auf der Beschreibung des Betreibers, liefere:
- title: ein kurzer Blickfang-Titel, maximal 40 Zeichen
- offerText: eine kurze, konkrete Zeile zum Angebot, maximal 80 Zeichen
- priceText: optional eine kurze Preis-/Aktionszeile, maximal 30 Zeichen, oder null falls kein Preis genannt wurde

Erfinde keine Preise, Zahlen oder Fakten, die nicht in der Beschreibung stehen. Natürlicher, werblicher aber nicht übertriebener Ton. Antworte ausschliesslich im verlangten JSON-Format.

Beschreibung des Betreibers: ${description}`;

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
        instructions,
        input: [{ role: "user", content: description }],
        max_output_tokens: 300,
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: "wizard_copy",
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
        store: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    console.error("wizard-copy: request failed", error);
    return json({ error: "Textvorschlag momentan nicht erreichbar." }, { status: 502 });
  }

  if (!response.ok) {
    console.error("wizard-copy: OpenAI responded with", response.status, await response.text().catch(() => ""));
    return json({ error: "Textvorschlag konnte nicht erstellt werden." }, { status: 502 });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return json({ error: "Ungültige Antwort." }, { status: 502 });
  }

  const record = payload as Record<string, unknown>;
  const rawText =
    typeof record.output_text === "string"
      ? record.output_text
      : Array.isArray(record.output)
        ? record.output
            .flatMap((item) =>
              item && typeof item === "object" && Array.isArray((item as Record<string, unknown>).content)
                ? (item as Record<string, unknown>).content
                : [],
            )
            .map((chunk) =>
              chunk && typeof chunk === "object" && typeof (chunk as Record<string, unknown>).text === "string"
                ? (chunk as Record<string, unknown>).text
                : "",
            )
            .join("")
        : "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText as string);
  } catch {
    return json({ error: "Antwort konnte nicht gelesen werden." }, { status: 502 });
  }

  const result = parsed as Record<string, unknown>;
  const title = text(result.title, 40);
  const offerText = text(result.offerText, 80);
  if (!title || !offerText) {
    return json({ error: "Unvollständiger Textvorschlag." }, { status: 502 });
  }
  const priceText = text(result.priceText, 30);

  return json({ title, offerText, priceText: priceText ?? null });
}
