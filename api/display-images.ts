import { randomUUID } from "node:crypto";
import { json, validatePublicPost, cleanText } from "./_lib/assistant/security.js";

// Implements the contract already documented in docs/display-image-api.md
// (written before this endpoint existed) — the frontend in
// src/ui/gastronomyShowroom.ts's contentAiGenerateHandler already calls
// whatever URL VITE_SWISSCOMPACT_IMAGE_API_URL points to with exactly this
// request/response shape. Reuses the assistant's generic security helpers
// (rate limiting, origin check) even though this route isn't assistant
// functionality — they're provider-agnostic utilities, not worth
// duplicating for one more route.
// GPT Image generation can take 40-90s for non-square sizes —
// confirmed in production logs, the original 40s/45s pair was too tight
// and aborted in-flight requests that OpenAI would otherwise have
// completed. Vercel Fluid Compute (seen in this project's function logs)
// supports well beyond 100s; if the plan's actual cap is lower, this will
// surface as a platform-level timeout rather than our own AbortSignal.
export const config = { runtime: "nodejs", maxDuration: 120 };

const VALID_ROLES = new Set(["background", "hero"]);
const VALID_ORIENTATIONS = new Set(["landscape", "portrait"]);

export async function POST(request: Request): Promise<Response> {
  const guardError = validatePublicPost(request, {
    key: "display-images",
    // Image generation is comparatively expensive — a tighter budget than
    // the chat endpoint on purpose.
    limit: 6,
    windowMs: 10 * 60_000,
    contentTypes: ["application/json"],
    maxBytes: 8_000,
  });
  if (guardError) return guardError;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: "Bild-KI ist momentan nicht verfügbar." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Ungültiger Anfrage-Body." }, { status: 400 });
  }

  const prompt = cleanText(body.prompt, 600);
  if (!prompt) {
    return json({ error: "Bildbeschreibung fehlt." }, { status: 400 });
  }
  const room = cleanText(body.room, 60) || "raum";
  const roleRaw = cleanText(body.role, 20);
  const role = VALID_ROLES.has(roleRaw) ? roleRaw : "background";
  const orientationRaw = cleanText(body.orientation, 20);
  const orientation = VALID_ORIENTATIONS.has(orientationRaw) ? orientationRaw : "landscape";

  const requestId = randomUUID();
  const size = orientation === "portrait" ? "1024x1536" : "1536x1024";
  // Deliberately asks for the flat poster/campaign graphic itself, not a
  // photo/mockup of a screen showing it — an earlier version of this
  // prompt asked for a "digital signage display in a room", which the
  // model took literally and rendered a framed monitor on a wall instead
  // of standalone artwork. The generated image is placed onto the real 3D
  // display programmatically; it must not depict a display itself.
  const scenePrompt = `Reines Werbeplakat-Motiv für einen Betrieb vom Typ "${room}" (${
    role === "hero" ? "grossflächiges Hauptmotiv" : "dezenter Hintergrund"
  }), wie eine hochwertige Kampagnengrafik oder ein Plakat. Zeige ausschliesslich die Grafik selbst, randabfüllend über das gesamte Bild. Kein Bildschirm, kein Display, kein Monitor, kein Rahmen, keine Wand, kein Raum, keine Perspektive auf eine Installation und kein Mockup — nur das Motiv selbst, so wie ein Print- oder Kampagnenmotiv aussieht, nicht wie ein Foto einer Anzeigetafel. Zentrierte, ruhige Komposition ohne wichtige Elemente nahe am Rand, damit sie sowohl im Hochformat als auch im Querformat funktioniert. Hochwertig, realistisch, Schweizer Qualitätsanspruch, keine Textelemente oder Logos im Bild. Motiv: ${prompt}`;

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
        prompt: scenePrompt,
        size,
        // Was previously unset (defaults to OpenAI's most expensive tier at
        // this size) — "medium" is a deliberate cost control for a live
        // display preview, not a technical necessity. Overridable via env
        // var without a code change if the tradeoff should shift later.
        quality: process.env.OPENAI_IMAGE_QUALITY || "medium",
        n: 1,
      }),
      signal: AbortSignal.timeout(110_000),
    });
  } catch (error) {
    console.error(`display-images[${requestId}]: request failed`, error);
    return json({ error: "Bilderstellung momentan nicht erreichbar.", requestId }, { status: 502 });
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error(`display-images[${requestId}]: OpenAI responded with`, response.status, errorBody.slice(0, 300));
    // 400 from OpenAI here is most often their own content-policy rejection
    // of the prompt — surface as a client error, not a server failure.
    const status = response.status === 400 ? 422 : 502;
    return json({ error: "Das Bild konnte nicht erstellt werden. Bitte die Beschreibung anpassen.", requestId }, { status });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return json({ error: "Ungültige Antwort der Bild-KI.", requestId }, { status: 502 });
  }

  const record = payload as Record<string, unknown>;
  const data = Array.isArray(record.data) ? (record.data[0] as Record<string, unknown> | undefined) : undefined;
  const b64 = typeof data?.b64_json === "string" ? data.b64_json : undefined;
  if (!b64) {
    console.error(`display-images[${requestId}]: no image in response`);
    return json({ error: "Kein Bild in der Antwort der Bild-KI.", requestId }, { status: 502 });
  }

  return json({ dataUrl: `data:image/png;base64,${b64}`, requestId });
}
