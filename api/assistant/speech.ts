import { json, validatePublicPost } from "../_lib/assistant/security";
import { cleanText } from "../_lib/assistant/engine";

export const config = { runtime: "nodejs", maxDuration: 30 };

// Deliberately returns the raw OpenAI TTS mp3 unmodified — the reference
// project's robotic-voice ffmpeg filter chain is that assistant's brand
// persona, not SwissCompact's.
export async function POST(request: Request): Promise<Response> {
  const guardError = validatePublicPost(request, {
    key: "assistant-speech",
    limit: 10,
    windowMs: 60_000,
    contentTypes: ["application/json"],
    maxBytes: 8_000,
  });
  if (guardError) return guardError;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: "Sprachausgabe ist momentan nicht verfügbar." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Ungültiger Anfrage-Body." }, { status: 400 });
  }

  const text = cleanText(body.text, 2200);
  if (!text) {
    return json({ error: "Text fehlt." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_ASSISTANT_TTS_MODEL || "gpt-4o-mini-tts",
        voice: process.env.OPENAI_ASSISTANT_VOICE || "alloy",
        input: text,
        instructions:
          "Ruhige, freundliche, sachliche Stimme auf Deutsch. Klingt wie ein kompetenter Berater, nicht werblich.",
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    console.error("assistant/speech: OpenAI request failed", error);
    return json({ error: "Sprachausgabe fehlgeschlagen." }, { status: 502 });
  }

  if (!response.ok) {
    console.error("assistant/speech: OpenAI responded with", response.status, await response.text().catch(() => ""));
    return json({ error: "Sprachausgabe fehlgeschlagen." }, { status: 502 });
  }

  return new Response(response.body, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
