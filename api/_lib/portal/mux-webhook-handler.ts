import { dashboardSupabase } from "../dashboard/auth.js";
import { json } from "../assistant/security.js";
import { getMuxAsset, muxReadyRendition, muxVideoEnabled, verifyMuxWebhook, type MuxAsset } from "./mux-video.js";

type MuxEvent = {
  id?: string;
  type?: string;
  object?: { type?: string; id?: string };
  data?: Record<string, any>;
};

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function muxState(payload: Record<string, any> | null | undefined): Record<string, any> {
  return payload?.mux && typeof payload.mux === "object" ? payload.mux : {};
}

async function contentForEvent(client: any, event: MuxEvent): Promise<any | null> {
  const data = event.data || {};
  const directContentId = text(data.passthrough || data.meta?.external_id || data.static_rendition?.passthrough, 80);
  if (/^[0-9a-f-]{36}$/i.test(directContentId)) {
    const direct = await client.from("tenant_content").select("id,tenant_id,payload,asset_path").eq("id", directContentId).maybeSingle();
    if (direct.data) return direct.data;
  }

  const uploadId = text(event.type?.startsWith("video.upload.") ? data.id : data.upload_id, 180);
  if (uploadId) {
    const byUpload = await client.from("tenant_content").select("id,tenant_id,payload,asset_path").contains("payload", { mux: { uploadId } }).maybeSingle();
    if (byUpload.data) return byUpload.data;
  }

  const assetId = text(data.asset_id || data.parent_asset_id || (event.type?.startsWith("video.asset.") && !event.type.includes("static_rendition") ? data.id : ""), 180);
  if (assetId) {
    const byAsset = await client.from("tenant_content").select("id,tenant_id,payload,asset_path").contains("payload", { mux: { assetId } }).maybeSingle();
    if (byAsset.data) return byAsset.data;
  }
  return null;
}

function eventError(event: MuxEvent): string {
  const data = event.data || {};
  return text(data.error?.message || data.errors?.messages?.[0] || data.message, 300) || "Das Video konnte nicht verarbeitet werden.";
}

function eventAssetId(event: MuxEvent, currentMux: Record<string, any>): string {
  const data = event.data || {};
  if (event.type === "video.upload.asset_created") return text(data.asset_id, 180);
  return text(data.asset_id || data.parent_asset_id || (event.type?.startsWith("video.asset.") && !event.type.includes("static_rendition") ? data.id : "") || currentMux.assetId, 180);
}

async function processMuxEvent(client: any, event: MuxEvent): Promise<void> {
  const content = await contentForEvent(client, event);
  if (!content) return;
  const now = new Date().toISOString();
  const payload = { ...(content.payload || {}) } as Record<string, any>;
  const mux = { ...muxState(payload) };
  const alreadyReady = payload.processingState === "ready" && payload.compatibilityStatus === "display_ready";
  const type = text(event.type, 120);
  const assetId = eventAssetId(event, mux);
  if (assetId) mux.assetId = assetId;

  let asset: MuxAsset | null = null;
  if (assetId && (type === "video.asset.ready" || type === "video.asset.static_rendition.ready")) {
    try { asset = await getMuxAsset(assetId); } catch (reason) { console.error("Mux asset reconciliation failed", reason); }
  }

  if (type === "video.upload.asset_created") {
    if (!alreadyReady) {
      payload.uploadState = "ready";
      payload.processingState = "processing";
      payload.compatibilityStatus = "normalizing";
    }
  } else if (type === "video.asset.ready" || type === "video.asset.static_rendition.created") {
    if (!alreadyReady) {
      payload.uploadState = "ready";
      payload.processingState = "processing";
      payload.compatibilityStatus = "creating_display_mp4";
    }
  } else if (type === "video.asset.static_rendition.ready") {
    const ready = asset ? muxReadyRendition(asset) : null;
    const eventName = text(event.data?.name || event.data?.static_rendition?.name, 180);
    const eventPlaybackId = text(event.data?.playback_id || event.data?.playback_ids?.find?.((entry: any) => entry?.policy === "signed")?.id, 180);
    const playbackId = ready?.playbackId || eventPlaybackId || text(mux.playbackId, 180);
    const renditionName = ready?.renditionName || eventName || "highest.mp4";
    if (playbackId && renditionName.endsWith(".mp4")) {
      mux.playbackId = playbackId;
      mux.renditionName = renditionName;
      mux.playbackPolicy = "signed";
      payload.uploadState = "ready";
      payload.processingState = "ready";
      payload.compatibilityStatus = "display_ready";
      payload.processedAt = now;
      delete payload.processingError;
    }
  } else if (type === "video.asset.errored" || type === "video.asset.static_rendition.errored" || type === "video.asset.static_rendition.skipped" || type === "video.upload.errored" || type === "video.upload.timed_out") {
    payload.uploadState = type.startsWith("video.upload.") ? "error" : "ready";
    payload.processingState = "error";
    payload.compatibilityStatus = "not_display_ready";
    payload.processingError = eventError(event);
  } else if (type === "video.asset.deleted") {
    payload.processingState = "error";
    payload.compatibilityStatus = "not_display_ready";
    payload.processingError = "Das aufbereitete Video ist nicht mehr verfügbar.";
  } else {
    return;
  }

  if (asset) {
    const ready = muxReadyRendition(asset);
    if (ready) {
      mux.playbackId = ready.playbackId;
      mux.renditionName = ready.renditionName;
      mux.playbackPolicy = "signed";
      payload.uploadState = "ready";
      payload.processingState = "ready";
      payload.compatibilityStatus = "display_ready";
      payload.processedAt = now;
      delete payload.processingError;
    }
    if (Number.isFinite(Number(asset.duration))) {
      payload.mediaMetadata = { ...(payload.mediaMetadata || {}), durationSeconds: Number(Number(asset.duration).toFixed(3)), muxResolutionTier: asset.max_resolution_tier || null };
    }
  }
  payload.mediaProvider = "mux";
  payload.mux = mux;

  const updated = await client.from("tenant_content").update({
    payload,
    asset_path: assetId ? `mux://${assetId}` : content.asset_path,
    updated_at: now,
  }).eq("id", content.id);
  if (updated.error) throw new Error(updated.error.message);
  await client.from("tenant_audit_log").insert({
    tenant_id: content.tenant_id,
    actor_user_id: null,
    action: "mux_video_event",
    entity_type: "content",
    entity_id: content.id,
    metadata: { eventId: text(event.id, 180), eventType: type, assetId: assetId || null },
  });
}

export async function handleMuxWebhookPost(request: Request): Promise<Response> {
  if (!muxVideoEnabled()) return json({ error: "Mux-Videopipeline ist nicht aktiviert" }, { status: 503 });
  const rawBody = await request.text();
  if (!verifyMuxWebhook(rawBody, request.headers.get("mux-signature"))) return json({ error: "Ungültige Webhook-Signatur" }, { status: 401 });
  let event: MuxEvent;
  try { event = JSON.parse(rawBody) as MuxEvent; } catch { return json({ error: "Ungültiges Ereignis" }, { status: 400 }); }
  const client = dashboardSupabase();
  if (!client) return json({ error: "Datenbank ist nicht konfiguriert" }, { status: 503 });
  try {
    await processMuxEvent(client, event);
    return json({ received: true });
  } catch (reason) {
    console.error("Mux webhook processing failed", reason);
    return json({ error: "Ereignis konnte nicht verarbeitet werden" }, { status: 500 });
  }
}
