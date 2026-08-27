import { createHash } from "node:crypto";
import { json, validatePublicPost } from "../_lib/assistant/security.js";
import { buildAssistantRealtimeInstructions } from "../_lib/assistant/prompt.js";

export const config = { runtime: "nodejs", maxDuration: 30 };

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request): Promise<Response> {
  const guardError = validatePublicPost(request, {
    key: "assistant-realtime",
    limit: 6,
    windowMs: 5 * 60_000,
    contentTypes: ["application/sdp"],
    maxBytes: 120_000,
  });
  if (guardError) return guardError;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: "Live-Gespräch ist momentan nicht verfügbar." }, { status: 503 });
  }

  const sdp = await request.text();
  if (!sdp || sdp.length > 120_000) {
    return json({ error: "Ungültige Audiositzung." }, { status: 400 });
  }

  const url = new URL(request.url);
  const sectionId = (url.searchParams.get("sectionId") || "hero").slice(0, 80);
  const session = {
    type: "realtime",
    model: process.env.OPENAI_ASSISTANT_REALTIME_MODEL || "gpt-realtime-2.1",
    instructions: buildAssistantRealtimeInstructions({ sectionId }),
    output_modalities: ["audio"],
    max_output_tokens: 700,
    audio: {
      input: {
        transcription: { model: "gpt-4o-mini-transcribe", language: "de" },
        turn_detection: {
          type: "semantic_vad",
          eagerness: "medium",
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: process.env.OPENAI_ASSISTANT_VOICE || "alloy" },
    },
  };

  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(session));
  const safetyIdentifier = createHash("sha256").update(`assistant:${clientAddress(request)}`).digest("hex");

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": safetyIdentifier,
      },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const answerSdp = await response.text();
    if (!response.ok) {
      console.error("assistant/realtime: session error", response.status, answerSdp.slice(0, 240));
      return json({ error: "Die Live-Verbindung konnte nicht aufgebaut werden." }, { status: response.status });
    }
    return new Response(answerSdp, {
      status: 200,
      headers: { "Content-Type": "application/sdp", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("assistant/realtime: request failed", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Live-Gespräch ist vorübergehend nicht erreichbar." }, { status: 502 });
  }
}
