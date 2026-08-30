import { randomBytes } from "node:crypto";
import { authorizePortal, dashboardSupabase, isResponse } from "../dashboard/auth.js";
import { cleanText, json, validatePublicPost } from "../assistant/security.js";
import { AI_IMAGE_FORMATS, AI_IMAGE_MODEL, AI_IMAGE_QUALITIES, type AiImageFormat, type AiImageQuality } from "./ai-config.js";
import { renderHeadline, type HeadlineConfiguration } from "./image-overlay.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Payload = Record<string, unknown>;

function headlineFrom(value: unknown): HeadlineConfiguration {
  const input = value && typeof value === "object" ? value as Payload : {};
  const position = cleanText(input.position, 20);
  const align = cleanText(input.align, 20);
  const color = cleanText(input.color, 20);
  return {
    enabled: Boolean(input.enabled),
    text: cleanText(input.text, 120),
    position: position === "top" || position === "center" || position === "bottom" ? position : "bottom",
    align: align === "left" || align === "center" || align === "right" ? align : "center",
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#ffffff",
    backdrop: input.backdrop !== false,
  };
}

async function failJob(client: any, tenantId: string, jobId: string, status: "failed" | "moderation_blocked", errorCode: string, message: string) {
  await client.rpc("refund_ai_credits", { target_tenant: tenantId, target_job: jobId });
  await client.from("tenant_ai_generation_jobs").update({
    status,
    error_code: errorCode,
    error_message: message.slice(0, 500),
    completed_at: new Date().toISOString(),
  }).eq("id", jobId).eq("tenant_id", tenantId);
}

export async function handleAiImagePost(request: Request): Promise<Response> {
  const guard = validatePublicPost(request, {
    key: "portal-ai-image",
    limit: 12,
    windowMs: 60 * 60_000,
    contentTypes: ["application/json"],
    maxBytes: 12_000,
  });
  if (guard) return guard;
  const authorized = await authorizePortal(request);
  if (isResponse(authorized)) return authorized;
  const { profile } = authorized;
  if (profile.role === "viewer") return json({ error: "Nur Lesezugriff" }, { status: 403 });
  const client = dashboardSupabase();
  if (!client) return json({ error: "Datenbank nicht konfiguriert" }, { status: 503 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json({ error: "Die KI-Bildgenerierung ist noch nicht konfiguriert" }, { status: 503 });

  let body: Payload;
  try { body = await request.json() as Payload; }
  catch { return json({ error: "Ungültige Anfrage" }, { status: 400 }); }

  const title = cleanText(body.title, 180);
  const prompt = cleanText(body.prompt, 1200);
  const qualityValue = cleanText(body.quality, 20) as AiImageQuality;
  const formatValue = cleanText(body.format, 20) as AiImageFormat;
  const quality = AI_IMAGE_QUALITIES[qualityValue] ? qualityValue : "medium";
  const format = AI_IMAGE_FORMATS[formatValue] ? formatValue : "landscape";
  const headline = headlineFrom(body.headline);
  const idempotencyKey = cleanText(body.idempotencyKey, 80);
  if (!title || !prompt) return json({ error: "Titel und Bildbeschreibung sind erforderlich" }, { status: 400 });
  if (!UUID_PATTERN.test(idempotencyKey)) return json({ error: "Ungültige Generierungs-ID" }, { status: 400 });
  if (headline.enabled && !headline.text) return json({ error: "Bitte geben Sie eine Überschrift ein" }, { status: 400 });

  const existing = await client.from("tenant_ai_generation_jobs")
    .select("id,status,content_id,asset_path")
    .eq("tenant_id", profile.tenantId).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing.data?.status === "completed" && existing.data.content_id) {
    const content = await client.from("tenant_content").select("id,title,content_type,status,payload,asset_path,created_at,updated_at")
      .eq("id", existing.data.content_id).eq("tenant_id", profile.tenantId).single();
    return json({ ok: true, record: content.data, repeated: true });
  }
  if (existing.data && ["queued", "running"].includes(existing.data.status)) {
    return json({ error: "Diese Generierung läuft bereits" }, { status: 409 });
  }
  if (existing.data && ["failed", "moderation_blocked"].includes(existing.data.status)) {
    return json({ error: "Dieser Auftrag ist bereits beendet. Bitte starten Sie die Generierung erneut." }, { status: 410 });
  }

  const imageConfig = AI_IMAGE_FORMATS[format];
  const creditCost = AI_IMAGE_QUALITIES[quality].credits;
  const job = await client.from("tenant_ai_generation_jobs").insert({
    tenant_id: profile.tenantId,
    requested_by: profile.userId,
    idempotency_key: idempotencyKey,
    title,
    prompt,
    model: AI_IMAGE_MODEL,
    quality,
    size: imageConfig.size,
    credit_cost: creditCost,
    configuration: { format, headline },
    status: "queued",
  }).select("id").single();
  if (job.error || !job.data) return json({ error: "Generierungsauftrag konnte nicht erstellt werden" }, { status: 400 });

  const reserved = await client.rpc("reserve_ai_credits", {
    target_tenant: profile.tenantId,
    target_job: job.data.id,
    requested_credits: creditCost,
  });
  if (reserved.error) {
    await client.from("tenant_ai_generation_jobs").update({ status: "failed", error_code: "insufficient_credits", error_message: reserved.error.message, completed_at: new Date().toISOString() }).eq("id", job.data.id);
    return json({ error: "Nicht genügend KI-Credits", code: "insufficient_credits" }, { status: 402 });
  }
  await client.from("tenant_ai_generation_jobs").update({ status: "running" }).eq("id", job.data.id);

  const scenePrompt = `Erzeuge ein hochwertiges, randabfüllendes Werbe- und Kampagnenmotiv für ein digitales Display. Schweizer Qualitätsanspruch, klare visuelle Hierarchie, keine Rahmen, keine Bildschirme, keine Mockups, keine Logos und keinerlei Text oder Schrift im Motiv. Wichtige Bildelemente mit ausreichend Sicherheitsabstand zum Rand. Motivbeschreibung: ${prompt}`;
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: AI_IMAGE_MODEL, prompt: scenePrompt, size: imageConfig.size, quality, output_format: "png", n: 1 }),
      signal: AbortSignal.timeout(150_000),
    });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "OpenAI nicht erreichbar";
    await failJob(client, profile.tenantId, job.data.id, "failed", "provider_unavailable", message);
    return json({ error: "Die Bild-KI ist momentan nicht erreichbar" }, { status: 502 });
  }

  const providerRequestId = response.headers.get("x-request-id");
  const responseText = await response.text();
  if (!response.ok) {
    let providerCode = "provider_error";
    try { providerCode = (JSON.parse(responseText) as { error?: { code?: string } }).error?.code || providerCode; } catch { /* empty */ }
    const blocked = providerCode === "moderation_blocked";
    await failJob(client, profile.tenantId, job.data.id, blocked ? "moderation_blocked" : "failed", providerCode, responseText);
    return json({ error: blocked ? "Das Motiv wurde von der Inhaltsprüfung abgelehnt. Bitte passen Sie die Beschreibung an." : "Das Bild konnte nicht erstellt werden", code: providerCode }, { status: blocked ? 422 : 502 });
  }

  let base64 = "";
  try {
    const parsed = JSON.parse(responseText) as { data?: Array<{ b64_json?: string }> };
    base64 = parsed.data?.[0]?.b64_json || "";
  } catch { /* handled below */ }
  if (!base64) {
    await failJob(client, profile.tenantId, job.data.id, "failed", "empty_provider_response", "Kein Bild in der Provider-Antwort");
    return json({ error: "Die Bild-KI hat kein Bild geliefert" }, { status: 502 });
  }

  let finalImage: Buffer;
  try {
    finalImage = await renderHeadline(Buffer.from(base64, "base64"), imageConfig.width, imageConfig.height, headline);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Bildverarbeitung fehlgeschlagen";
    await failJob(client, profile.tenantId, job.data.id, "failed", "image_processing_failed", message);
    return json({ error: "Das Bild konnte nicht für das Display aufbereitet werden" }, { status: 502 });
  }

  const now = new Date().toISOString();
  const assetPath = `${profile.tenantId}/${now.slice(0, 7)}/ai-${randomBytes(16).toString("hex")}.webp`;
  const uploaded = await client.storage.from("swisscompact-media").upload(assetPath, finalImage, { contentType: "image/webp", cacheControl: "3600", upsert: false });
  if (uploaded.error) {
    await failJob(client, profile.tenantId, job.data.id, "failed", "storage_upload_failed", uploaded.error.message);
    return json({ error: "Das generierte Bild konnte nicht gespeichert werden" }, { status: 503 });
  }

  const content = await client.from("tenant_content").insert({
    tenant_id: profile.tenantId,
    title,
    content_type: "image",
    status: "draft",
    asset_path: assetPath,
    payload: { uploadState: "ready", source: "ai", prompt, model: AI_IMAGE_MODEL, quality, format, headline, creditCost },
    created_by: profile.userId,
    updated_by: profile.userId,
  }).select("id,title,content_type,status,payload,asset_path,created_at,updated_at").single();
  if (content.error || !content.data) {
    await client.storage.from("swisscompact-media").remove([assetPath]);
    await failJob(client, profile.tenantId, job.data.id, "failed", "content_create_failed", content.error?.message || "Inhalt konnte nicht erstellt werden");
    return json({ error: "Der generierte Inhalt konnte nicht angelegt werden" }, { status: 503 });
  }

  await client.from("tenant_ai_generation_jobs").update({
    status: "completed",
    content_id: content.data.id,
    asset_path: assetPath,
    provider_request_id: providerRequestId,
    completed_at: now,
  }).eq("id", job.data.id).eq("tenant_id", profile.tenantId);
  await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "ai_image_generated", entity_type: "content", entity_id: content.data.id, metadata: { jobId: job.data.id, quality, format, creditCost } });
  const balance = Array.isArray(reserved.data) ? reserved.data[0] : null;
  return json({ ok: true, record: content.data, credits: balance });
}
