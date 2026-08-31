import { authorizeDashboard, authorizePortal, dashboardSupabase, isResponse, writeAudit } from "../_lib/dashboard/auth.js";
import { cleanText, json, rateLimit, validEmail, validatePublicPost } from "../_lib/assistant/security.js";
import { escapeHtml } from "../_lib/assistant/spamGuard.js";
import { createQuotePdf } from "../_lib/dashboard/documents.js";
import { createHash, randomBytes } from "node:crypto";
import { Resend } from "resend";
import { getPublicQuote, postPublicQuote } from "../_lib/dashboard/quote-public.js";
import { handleAiCreditsPost, handleAiCreditsStatusGet } from "../_lib/portal/ai-credits-handler.js";
import { handleAiImagePost } from "../_lib/portal/ai-image-handler.js";
import { handleStripeWebhookPost } from "../_lib/portal/stripe-webhook-handler.js";

export const config = { runtime: "nodejs", maxDuration: 180 };

type Payload = Record<string, unknown>;

const PORTAL_MEDIA_BUCKET = "swisscompact-media";
const PORTAL_MEDIA_TYPES: Record<string, { type: "image" | "video"; extension: string; maxBytes: number }> = {
  "image/jpeg": { type: "image", extension: "jpg", maxBytes: 20 * 1024 * 1024 },
  "image/png": { type: "image", extension: "png", maxBytes: 20 * 1024 * 1024 },
  "image/webp": { type: "image", extension: "webp", maxBytes: 20 * 1024 * 1024 },
  "video/mp4": { type: "video", extension: "mp4", maxBytes: 250 * 1024 * 1024 },
  "video/webm": { type: "video", extension: "webm", maxBytes: 250 * 1024 * 1024 },
};

function resumableStorageUrl(signedUploadUrl: string): string {
  const url = new URL(signedUploadUrl);
  if (url.hostname.endsWith(".supabase.co") && !url.hostname.endsWith(".storage.supabase.co")) {
    url.hostname = url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  }
  url.pathname = "/storage/v1/upload/resumable/sign";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function deviceToken(request: Request): string {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

function newPairingCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(8), (value) => alphabet[value % alphabet.length]).join("");
}

async function bumpDisplayConfigurations(client: any, displayIds: string[]): Promise<void> {
  const ids = [...new Set(displayIds.filter(Boolean))];
  if (!ids.length) return;
  const current = await client.from("tenant_displays").select("id,configuration_version").in("id", ids);
  await Promise.all((current.data ?? []).map((display: { id: string; configuration_version?: number }) => client.from("tenant_displays").update({ configuration_version: Number(display.configuration_version || 1) + 1, updated_at: new Date().toISOString() }).eq("id", display.id)));
}

async function contentUsage(client: any, tenantId: string, contentId: string): Promise<{ campaignIds: string[]; displayIds: string[] }> {
  const [legacyLinks, targetLinks] = await Promise.all([
    client.from("tenant_campaign_content").select("campaign_id").eq("content_id", contentId),
    client.from("tenant_campaign_display_content").select("display_id").eq("content_id", contentId).eq("tenant_id", tenantId),
  ]);
  const campaignIds = [...new Set<string>((legacyLinks.data ?? []).map((link: { campaign_id: string }) => link.campaign_id))];
  const campaignTargets = campaignIds.length
    ? await client.from("tenant_campaign_displays").select("display_id").in("campaign_id", campaignIds)
    : { data: [] as Array<{ display_id: string }> };
  return {
    campaignIds,
    displayIds: [...new Set<string>([...(targetLinks.data ?? []).map((link: { display_id: string }) => link.display_id), ...(campaignTargets.data ?? []).map((link: { display_id: string }) => link.display_id)])],
  };
}

async function validCampaignScope(client: any, tenantId: string, siteId: string | null, areaId: string | null): Promise<boolean> {
  if (siteId) {
    const site = await client.from("tenant_sites").select("id").eq("id", siteId).eq("tenant_id", tenantId).eq("active", true).maybeSingle();
    if (!site.data) return false;
  }
  if (areaId) {
    let areaQuery = client.from("tenant_areas").select("id").eq("id", areaId).eq("tenant_id", tenantId).eq("active", true);
    if (siteId) areaQuery = areaQuery.eq("site_id", siteId);
    const area = await areaQuery.maybeSingle();
    if (!area.data) return false;
  }
  return true;
}

async function deviceRecord(request: Request) {
  const token = deviceToken(request);
  if (token.length < 32) return null;
  const client = dashboardSupabase();
  if (!client) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const display = await client.from("tenant_displays").select("id,tenant_id,name,status,configuration_version,device_token_hash").eq("device_token_hash", tokenHash).maybeSingle();
  return display.data ? { client, display: display.data } : null;
}

async function handleDevicePost(request: Request, mode: string): Promise<Response> {
  const limited = rateLimit(request, { key: `display-device-${mode}`, limit: mode === "pair" ? 20 : 180, windowMs: 10 * 60_000 });
  if (limited) return limited;
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return json({ error: "JSON erforderlich" }, { status: 415 });
  let body: Payload;
  try { body = await request.json() as Payload; } catch { return json({ error: "Ungültige Anfrage" }, { status: 400 }); }

  if (mode === "pair") {
    const client = dashboardSupabase();
    if (!client) return json({ error: "Geräteanbindung ist noch nicht konfiguriert" }, { status: 503 });
    const displayId = cleanText(body.displayId, 80);
    const code = cleanText(body.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!displayId || code.length !== 8) return json({ error: "Ungültiger Aktivierungscode" }, { status: 400 });
    const codeHash = createHash("sha256").update(`${displayId}:${code}`).digest("hex");
    const display = await client.from("tenant_displays").select("id,tenant_id,name,pairing_expires_at").eq("id", displayId).eq("pairing_code_hash", codeHash).maybeSingle();
    if (!display.data || !display.data.pairing_expires_at || new Date(display.data.pairing_expires_at).getTime() <= Date.now()) return json({ error: "Aktivierungscode ist falsch oder abgelaufen" }, { status: 401 });
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const now = new Date().toISOString();
    const updated = await client.from("tenant_displays").update({ device_token_hash: tokenHash, pairing_code_hash: null, pairing_expires_at: null, paired_at: now, last_seen_at: now, status: "online", software_version: cleanText(body.softwareVersion, 80) || null, configuration_version: 1, updated_at: now }).eq("id", displayId).select("id,name,configuration_version").single();
    if (updated.error) return json({ error: "Display konnte nicht aktiviert werden" }, { status: 400 });
    await client.from("tenant_audit_log").insert({ tenant_id: display.data.tenant_id, action: "device_paired", entity_type: "display", entity_id: displayId });
    return json({ ok: true, token, display: updated.data });
  }

  const authorized = await deviceRecord(request);
  if (!authorized) return json({ error: "Ungültiger Gerätetoken" }, { status: 401 });
  if (mode === "heartbeat") {
    const now = new Date().toISOString();
    const result = await authorized.client.from("tenant_displays").update({ status: cleanText(body.health, 30) === "maintenance" ? "maintenance" : "online", last_seen_at: now, software_version: cleanText(body.softwareVersion, 80) || null, last_error: cleanText(body.lastError, 1000) || null, updated_at: now }).eq("id", authorized.display.id);
    if (result.error) return json({ error: "Status konnte nicht aktualisiert werden" }, { status: 400 });
    return json({ ok: true, configurationVersion: authorized.display.configuration_version });
  }
  return json({ error: "Unbekannte Geräteaktion" }, { status: 404 });
}

async function buildDisplayConfig(client: any, display: any, updateDeviceState = true): Promise<Response> {
  const targets = await client.from("tenant_campaign_displays").select("campaign_id").eq("display_id", display.id);
  const campaignIds = (targets.data ?? []).map((entry: { campaign_id: string }) => entry.campaign_id);
  if (!campaignIds.length) return json({ display: { id: display.id, name: display.name }, configurationVersion: display.configuration_version, campaigns: [], playlist: [], generatedAt: new Date().toISOString() });
  const campaigns = await client.from("tenant_campaigns").select("id,name,status,starts_at,ends_at,updated_at,content_links:tenant_campaign_content(position,duration_seconds,content:tenant_content(id,title,content_type,status,payload,asset_path))").in("id", campaignIds).in("status", ["active", "scheduled"]).order("starts_at", { ascending: true, nullsFirst: true });
  if (campaigns.error) return json({ error: "Konfiguration konnte nicht geladen werden" }, { status: 503 });
  const targetContent = await client.from("tenant_campaign_display_content")
    .select("campaign_id,position,duration_seconds,content:tenant_content(id,title,content_type,status,payload,asset_path)")
    .eq("tenant_id", display.tenant_id).eq("display_id", display.id).in("campaign_id", campaignIds).order("position");
  if (targetContent.error) return json({ error: "Die zielbezogenen Kampagneninhalte konnten nicht geladen werden" }, { status: 503 });
  const targetContentByCampaign = new Map<string, typeof targetContent.data>();
  for (const link of targetContent.data ?? []) {
    const links = targetContentByCampaign.get(link.campaign_id) ?? [];
    links.push(link);
    targetContentByCampaign.set(link.campaign_id, links);
  }
  const now = Date.now();
  const activeCampaigns = (campaigns.data ?? []).filter((campaign: any) => (!campaign.starts_at || new Date(campaign.starts_at).getTime() <= now) && (!campaign.ends_at || new Date(campaign.ends_at).getTime() > now));
  const playlist = [] as Array<Record<string, unknown>>;
  for (const campaign of activeCampaigns) {
    if (updateDeviceState && campaign.status === "scheduled") await client.from("tenant_campaigns").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", campaign.id);
    const targetedLinks = targetContentByCampaign.get(campaign.id) ?? [];
    const links = [...(targetedLinks.length ? targetedLinks : campaign.content_links || [])].sort((a, b) => a.position - b.position);
    for (const link of links) {
      const linkedContent = Array.isArray(link.content) ? link.content[0] : link.content;
      const content = linkedContent as { id: string; title: string; content_type: string; status: string; payload: Record<string, unknown>; asset_path?: string | null } | null;
      if (!content || !["approved", "published"].includes(content.status)) continue;
      let mediaUrl: string | null = null;
      if (content.asset_path) {
        const signed = await client.storage.from(PORTAL_MEDIA_BUCKET).createSignedUrl(content.asset_path, 6 * 60 * 60);
        mediaUrl = signed.data?.signedUrl ?? null;
      }
      playlist.push({ campaignId: campaign.id, campaignName: campaign.name, contentId: content.id, title: content.title, contentType: content.content_type, payload: content.payload, mediaUrl, durationSeconds: Math.min(3600, Math.max(5, Number(link.duration_seconds) || 10)) });
    }
  }
  if (updateDeviceState) await client.from("tenant_displays").update({ last_config_at: new Date().toISOString() }).eq("id", display.id);
  return json({ display: { id: display.id, name: display.name }, configurationVersion: display.configuration_version, campaigns: activeCampaigns.map((campaign: any) => ({ id: campaign.id, name: campaign.name, status: campaign.status, starts_at: campaign.starts_at, ends_at: campaign.ends_at, updated_at: campaign.updated_at })), playlist, generatedAt: new Date().toISOString() });
}

async function handleDeviceConfig(request: Request): Promise<Response> {
  const authorized = await deviceRecord(request);
  if (!authorized) return json({ error: "Ungültiger Gerätetoken" }, { status: 401 });
  return buildDisplayConfig(authorized.client, authorized.display);
}

async function handlePortalPlayerPreview(request: Request, displayId: string): Promise<Response> {
  const authorized = await authorizePortal(request);
  if (isResponse(authorized)) return authorized;
  const display = await authorized.client.from("tenant_displays")
    .select("id,tenant_id,name,status,configuration_version")
    .eq("id", displayId).eq("tenant_id", authorized.profile.tenantId).maybeSingle();
  if (display.error || !display.data) return json({ error: "Bildschirm nicht gefunden" }, { status: 404 });
  return buildDisplayConfig(authorized.client, display.data, false);
}

async function handlePortalRecords(request: Request): Promise<Response> {
  const authorized = await authorizePortal(request);
  if (isResponse(authorized)) return authorized;
  const { client, profile } = authorized;
  if (profile.role === "viewer") return json({ error: "Nur Lesezugriff" }, { status: 403 });
  const body = await request.json() as Payload;
  const action = cleanText(body.action, 80);
  const now = new Date().toISOString();

  if (action === "prepare_media_upload") {
    const title = cleanText(body.title, 180);
    const mimeType = cleanText(body.mimeType, 80).toLowerCase();
    const sizeBytes = Math.max(0, Math.floor(Number(body.sizeBytes) || 0));
    const media = PORTAL_MEDIA_TYPES[mimeType];
    if (!title) return json({ error: "Titel fehlt" }, { status: 400 });
    if (!media || sizeBytes < 1 || sizeBytes > media.maxBytes) {
      return json({ error: "Dateityp oder Dateigrösse wird nicht unterstützt" }, { status: 400 });
    }
    const month = now.slice(0, 7);
    const assetPath = `${profile.tenantId}/${month}/${randomBytes(16).toString("hex")}.${media.extension}`;
    const signed = await client.storage.from(PORTAL_MEDIA_BUCKET).createSignedUploadUrl(assetPath);
    if (signed.error || !signed.data?.token) return json({ error: `Upload konnte nicht vorbereitet werden${signed.error?.message ? `: ${signed.error.message}` : ""}` }, { status: 503 });
    const result = await client.from("tenant_content").insert({
      tenant_id: profile.tenantId,
      title,
      content_type: media.type,
      status: "draft",
      asset_path: assetPath,
      payload: { mimeType, sizeBytes, uploadState: "uploading" },
      created_by: profile.userId,
      updated_by: profile.userId,
    }).select("id,title,content_type,status,payload,asset_path,created_at,updated_at").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "upload_prepared", entity_type: "content", entity_id: result.data.id, metadata: { mimeType, sizeBytes } });
    return json({
      ok: true,
      record: result.data,
      upload: {
        signedUrl: signed.data.signedUrl,
        token: signed.data.token,
        path: signed.data.path,
        resumableUrl: resumableStorageUrl(signed.data.signedUrl),
      },
    });
  }

  if (action === "finalize_media_upload") {
    const id = cleanText(body.id, 80);
    if (!id) return json({ error: "Inhalt fehlt" }, { status: 400 });
    const existing = await client.from("tenant_content").select("id,asset_path,payload").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (existing.error || !existing.data?.asset_path) return json({ error: "Inhalt nicht gefunden" }, { status: 404 });
    const parts = existing.data.asset_path.split("/");
    const filename = parts.pop() || "";
    const directory = parts.join("/");
    const stored = await client.storage.from(PORTAL_MEDIA_BUCKET).list(directory, { limit: 10, search: filename });
    if (stored.error || !stored.data?.some((entry) => entry.name === filename)) return json({ error: "Die Datei wurde noch nicht vollständig übertragen" }, { status: 409 });
    const result = await client.from("tenant_content").update({
      payload: { ...(existing.data.payload || {}), uploadState: "ready" },
      updated_by: profile.userId,
      updated_at: now,
    }).eq("id", id).eq("tenant_id", profile.tenantId).select("id,title,content_type,status,payload,asset_path,created_at,updated_at").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "upload_completed", entity_type: "content", entity_id: result.data.id });
    return json({ ok: true, record: result.data });
  }

  if (action === "cancel_media_upload") {
    const id = cleanText(body.id, 80);
    if (!id) return json({ error: "Inhalt fehlt" }, { status: 400 });
    const existing = await client.from("tenant_content").select("id,asset_path,payload").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (existing.error || !existing.data || existing.data.payload?.uploadState !== "uploading") {
      return json({ error: "Upload nicht gefunden" }, { status: 404 });
    }
    if (existing.data.asset_path) await client.storage.from(PORTAL_MEDIA_BUCKET).remove([existing.data.asset_path]);
    const removed = await client.from("tenant_content").delete().eq("id", id).eq("tenant_id", profile.tenantId);
    if (removed.error) return json({ error: removed.error.message }, { status: 400 });
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "upload_cancelled", entity_type: "content", entity_id: id });
    return json({ ok: true });
  }

  if (action === "create_content") {
    const title = cleanText(body.title, 180);
    const contentType = cleanText(body.contentType, 30);
    const text = cleanText(body.text, 10_000);
    if (!title) return json({ error: "Titel fehlt" }, { status: 400 });
    if (!["image", "video", "text", "composition", "template", "web"].includes(contentType)) {
      return json({ error: "Ungültiger Inhaltstyp" }, { status: 400 });
    }
    const result = await client.from("tenant_content").insert({
      tenant_id: profile.tenantId,
      title,
      content_type: contentType,
      status: "draft",
      payload: text ? { text } : {},
      created_by: profile.userId,
      updated_by: profile.userId,
    }).select("id,title,content_type,status,payload,asset_path,created_at,updated_at").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "create", entity_type: "content", entity_id: result.data.id });
    return json({ ok: true, record: result.data });
  }

  if (action === "update_content_status") {
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 30);
    if (!id || !["draft", "review", "approved", "published", "archived"].includes(status)) {
      return json({ error: "Ungültige Statusänderung" }, { status: 400 });
    }
    const result = await client.from("tenant_content").update({ status, updated_by: profile.userId, updated_at: now })
      .eq("id", id).eq("tenant_id", profile.tenantId)
      .select("id,title,content_type,status,payload,asset_path,created_at,updated_at").single();
    if (result.error) return json({ error: "Inhalt nicht gefunden oder Zugriff verweigert" }, { status: 404 });
    const usage = await contentUsage(client, profile.tenantId, id);
    await bumpDisplayConfigurations(client, usage.displayIds);
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "status_change", entity_type: "content", entity_id: result.data.id, metadata: { status } });
    return json({ ok: true, record: result.data });
  }

  if (action === "update_content") {
    const id = cleanText(body.id, 80);
    const title = cleanText(body.title, 180);
    const text = cleanText(body.text, 10_000);
    if (!id || !title) return json({ error: "Titel und Inhalt fehlen" }, { status: 400 });
    const existing = await client.from("tenant_content").select("id,payload").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (existing.error || !existing.data) return json({ error: "Inhalt nicht gefunden" }, { status: 404 });
    const payload = { ...(existing.data.payload || {}) } as Record<string, unknown>;
    if (text) payload.text = text; else delete payload.text;
    const result = await client.from("tenant_content").update({ title, payload, updated_by: profile.userId, updated_at: now })
      .eq("id", id).eq("tenant_id", profile.tenantId)
      .select("id,title,content_type,status,payload,asset_path,created_at,updated_at").single();
    if (result.error) return json({ error: "Inhalt konnte nicht aktualisiert werden" }, { status: 400 });
    const usage = await contentUsage(client, profile.tenantId, id);
    await bumpDisplayConfigurations(client, usage.displayIds);
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "update", entity_type: "content", entity_id: id });
    return json({ ok: true, record: result.data });
  }

  if (action === "delete_content") {
    const id = cleanText(body.id, 80);
    if (!id) return json({ error: "Inhalt fehlt" }, { status: 400 });
    const existing = await client.from("tenant_content").select("id,title,asset_path").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (existing.error || !existing.data) return json({ error: "Inhalt nicht gefunden" }, { status: 404 });
    if (cleanText(body.confirmationName, 180) !== existing.data.title) return json({ error: "Der eingegebene Name stimmt nicht überein" }, { status: 409 });
    const usage = await contentUsage(client, profile.tenantId, id);
    const removed = await client.from("tenant_content").delete().eq("id", id).eq("tenant_id", profile.tenantId);
    if (removed.error) return json({ error: "Inhalt konnte nicht gelöscht werden" }, { status: 400 });
    await bumpDisplayConfigurations(client, usage.displayIds);
    if (existing.data.asset_path) {
      const storageRemoval = await client.storage.from(PORTAL_MEDIA_BUCKET).remove([existing.data.asset_path]);
      if (storageRemoval.error) console.error("content asset cleanup:", storageRemoval.error.message);
    }
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "delete", entity_type: "content", entity_id: id, metadata: { title: existing.data.title, removedFromCampaigns: usage.campaignIds.length } });
    return json({ ok: true });
  }

  if (action === "create_campaign") {
    const name = cleanText(body.name, 180);
    const theme = cleanText(body.theme, 180) || null;
    const scopeSiteId = cleanText(body.scopeSiteId, 80) || null;
    const scopeAreaId = cleanText(body.scopeAreaId, 80) || null;
    const startsAt = optionalDate(body.startsAt);
    const endsAt = optionalDate(body.endsAt);
    if (!name) return json({ error: "Name der Kampagne fehlt" }, { status: 400 });
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return json({ error: "Das Enddatum muss nach dem Start liegen" }, { status: 400 });
    if (!await validCampaignScope(client, profile.tenantId, scopeSiteId, scopeAreaId)) return json({ error: "Standort oder Bereich gehört nicht zu diesem Kunden" }, { status: 403 });
    const result = await client.from("tenant_campaigns").insert({
      tenant_id: profile.tenantId,
      name,
      status: "draft",
      theme,
      scope_site_id: scopeSiteId,
      scope_area_id: scopeAreaId,
      starts_at: startsAt,
      ends_at: endsAt,
      created_by: profile.userId,
    }).select("id,name,theme,status,scope_site_id,scope_area_id,starts_at,ends_at,schedule,created_at,updated_at").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "create", entity_type: "campaign", entity_id: result.data.id });
    return json({ ok: true, record: result.data });
  }

  if (action === "create_site") {
    if (!['owner', 'admin'].includes(profile.role)) return json({ error: "Nur Portal-Administratoren können Standorte erstellen" }, { status: 403 });
    const name = cleanText(body.name, 180);
    if (!name) return json({ error: "Standortname fehlt" }, { status: 400 });
    const result = await client.from("tenant_sites").insert({ tenant_id: profile.tenantId, name, address: {}, timezone: "Europe/Zurich", active: true }).select("id,name,address,timezone,active,created_at,updated_at").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "create", entity_type: "site", entity_id: result.data.id });
    return json({ ok: true, record: result.data });
  }

  if (action === "create_area") {
    if (!["owner", "admin"].includes(profile.role)) return json({ error: "Nur Portal-Administratoren können Bereiche erstellen" }, { status: 403 });
    const siteId = cleanText(body.siteId, 80);
    const parentId = cleanText(body.parentId, 80) || null;
    const name = cleanText(body.name, 180);
    const kind = cleanText(body.kind, 30) || "area";
    if (!siteId || !name || !["building", "floor", "area", "zone"].includes(kind)) return json({ error: "Bereichsangaben sind unvollständig" }, { status: 400 });
    const site = await client.from("tenant_sites").select("id").eq("id", siteId).eq("tenant_id", profile.tenantId).eq("active", true).maybeSingle();
    if (!site.data) return json({ error: "Standort nicht gefunden" }, { status: 404 });
    if (parentId) {
      const parent = await client.from("tenant_areas").select("id").eq("id", parentId).eq("tenant_id", profile.tenantId).eq("site_id", siteId).maybeSingle();
      if (!parent.data) return json({ error: "Übergeordneter Bereich nicht gefunden" }, { status: 404 });
    }
    const result = await client.from("tenant_areas").insert({ tenant_id: profile.tenantId, site_id: siteId, parent_id: parentId, name, kind, active: true }).select("id,site_id,parent_id,name,kind,active,created_at,updated_at").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "create", entity_type: "area", entity_id: result.data.id });
    return json({ ok: true, record: result.data });
  }

  if (action === "create_display") {
    if (!['owner', 'admin'].includes(profile.role)) return json({ error: "Nur Portal-Administratoren können Bildschirme registrieren" }, { status: 403 });
    const name = cleanText(body.name, 180);
    const siteId = cleanText(body.siteId, 80);
    const areaId = cleanText(body.areaId, 80) || null;
    const kind = cleanText(body.kind, 30);
    const orientation = cleanText(body.orientation, 30);
    if (!name || !siteId || !["display", "led_wall", "led_controller", "player"].includes(kind) || !["landscape", "portrait", "custom"].includes(orientation)) return json({ error: "Bildschirmangaben sind unvollständig" }, { status: 400 });
    const site = await client.from("tenant_sites").select("id").eq("id", siteId).eq("tenant_id", profile.tenantId).eq("active", true).maybeSingle();
    if (!site.data) return json({ error: "Standort nicht gefunden" }, { status: 404 });
    if (areaId) {
      const area = await client.from("tenant_areas").select("id").eq("id", areaId).eq("tenant_id", profile.tenantId).eq("site_id", siteId).eq("active", true).maybeSingle();
      if (!area.data) return json({ error: "Bereich nicht gefunden" }, { status: 404 });
    }
    const created = await client.from("tenant_displays").insert({ tenant_id: profile.tenantId, site_id: siteId, area_id: areaId, name, kind, orientation, status: "provisioning" }).select("id,name,status,kind,orientation,area_id").single();
    if (created.error) return json({ error: created.error.message }, { status: 400 });
    const code = newPairingCode();
    const codeHash = createHash("sha256").update(`${created.data.id}:${code}`).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const prepared = await client.from("tenant_displays").update({ pairing_code_hash: codeHash, pairing_expires_at: expiresAt }).eq("id", created.data.id);
    if (prepared.error) {
      await client.from("tenant_displays").delete().eq("id", created.data.id);
      return json({ error: "Aktivierungscode konnte nicht erstellt werden. Bitte zuerst die Gerätemigration ausführen." }, { status: 503 });
    }
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "create", entity_type: "display", entity_id: created.data.id });
    return json({ ok: true, record: created.data, pairing: { displayId: created.data.id, code, expiresAt } });
  }

  if (action === "renew_display_pairing") {
    if (!['owner', 'admin'].includes(profile.role)) return json({ error: "Nur Portal-Administratoren können Bildschirme aktivieren" }, { status: 403 });
    const id = cleanText(body.id, 80);
    const display = await client.from("tenant_displays").select("id,name").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (!display.data) return json({ error: "Bildschirm nicht gefunden" }, { status: 404 });
    const code = newPairingCode();
    const codeHash = createHash("sha256").update(`${id}:${code}`).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const result = await client.from("tenant_displays").update({
      pairing_code_hash: codeHash,
      pairing_expires_at: expiresAt,
      device_token_hash: null,
      paired_at: null,
      status: "provisioning",
      last_error: null,
      updated_at: now,
    }).eq("id", id);
    if (result.error) return json({ error: "Aktivierungscode konnte nicht erneuert werden" }, { status: 400 });
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "pairing_renewed", entity_type: "display", entity_id: id, metadata: { previousDeviceRevoked: true } });
    return json({ ok: true, pairing: { displayId: id, code, expiresAt }, record: display.data });
  }

  if (action === "delete_display") {
    if (!["owner", "admin"].includes(profile.role)) return json({ error: "Nur Inhaber oder Admins können Bildschirme löschen" }, { status: 403 });
    const id = cleanText(body.id, 80);
    if (!id) return json({ error: "Bildschirm fehlt" }, { status: 400 });
    const existing = await client.from("tenant_displays").select("id,name,status").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (existing.error || !existing.data) return json({ error: "Bildschirm nicht gefunden" }, { status: 404 });
    if (cleanText(body.confirmationName, 180) !== existing.data.name) return json({ error: "Der eingegebene Name stimmt nicht überein" }, { status: 409 });
    const removed = await client.from("tenant_displays").delete().eq("id", id).eq("tenant_id", profile.tenantId);
    if (removed.error) return json({ error: "Bildschirm konnte nicht gelöscht werden" }, { status: 400 });
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "delete", entity_type: "display", entity_id: id, metadata: { name: existing.data.name, previousStatus: existing.data.status } });
    return json({ ok: true });
  }

  if (action === "update_display") {
    if (!["owner", "admin"].includes(profile.role)) return json({ error: "Nur Inhaber oder Admins können Bildschirme bearbeiten" }, { status: 403 });
    const id = cleanText(body.id, 80);
    const name = cleanText(body.name, 180);
    const siteId = cleanText(body.siteId, 80);
    const areaId = cleanText(body.areaId, 80) || null;
    const kind = cleanText(body.kind, 30);
    const orientation = cleanText(body.orientation, 30);
    if (!id || !name || !siteId || !["display", "led_wall", "led_controller", "player"].includes(kind) || !["landscape", "portrait", "custom"].includes(orientation)) return json({ error: "Bildschirmangaben sind unvollständig" }, { status: 400 });
    const site = await client.from("tenant_sites").select("id").eq("id", siteId).eq("tenant_id", profile.tenantId).eq("active", true).maybeSingle();
    if (!site.data) return json({ error: "Standort nicht gefunden" }, { status: 404 });
    if (areaId) {
      const area = await client.from("tenant_areas").select("id").eq("id", areaId).eq("tenant_id", profile.tenantId).eq("site_id", siteId).eq("active", true).maybeSingle();
      if (!area.data) return json({ error: "Bereich nicht gefunden" }, { status: 404 });
    }
    const result = await client.from("tenant_displays").update({ name, site_id: siteId, area_id: areaId, kind, orientation, updated_at: now })
      .eq("id", id).eq("tenant_id", profile.tenantId)
      .select("id,site_id,area_id,name,kind,status,orientation,resolution,created_at,updated_at").single();
    if (result.error) return json({ error: "Bildschirm konnte nicht aktualisiert werden" }, { status: 400 });
    await bumpDisplayConfigurations(client, [id]);
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "update", entity_type: "display", entity_id: id });
    return json({ ok: true, record: result.data });
  }

  if (action === "configure_campaign") {
    const id = cleanText(body.id, 80);
    const name = cleanText(body.name, 180);
    const theme = cleanText(body.theme, 180) || null;
    const scopeSiteId = cleanText(body.scopeSiteId, 80) || null;
    const scopeAreaId = cleanText(body.scopeAreaId, 80) || null;
    const startsAt = optionalDate(body.startsAt);
    const endsAt = optionalDate(body.endsAt);
    const rawAssignments = Array.isArray(body.targetAssignments) ? body.targetAssignments : [];
    const legacyContent = Array.isArray(body.contentItems) ? body.contentItems : [];
    const legacyDisplays = Array.isArray(body.displayIds) ? body.displayIds : [];
    const assignments = (rawAssignments.length ? rawAssignments : legacyDisplays.map((displayId) => ({ displayId, contentItems: legacyContent }))).map((entry) => {
      const assignment = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const rawItems = Array.isArray(assignment.contentItems) ? assignment.contentItems : [];
      return {
        displayId: cleanText(assignment.displayId, 80),
        contentItems: rawItems.map((contentEntry, position) => {
          const item = contentEntry && typeof contentEntry === "object" ? contentEntry as Record<string, unknown> : {};
          return { contentId: cleanText(item.contentId, 80), position, durationSeconds: Math.min(3600, Math.max(5, Math.round(Number(item.durationSeconds) || 10))) };
        }).filter((item) => item.contentId),
      };
    }).filter((assignment) => assignment.displayId);
    const totalContentItems = assignments.reduce((total, assignment) => total + assignment.contentItems.length, 0);
    if (!id || !name || assignments.length > 200 || totalContentItems > 2000) return json({ error: "Ungültige Kampagnenkonfiguration" }, { status: 400 });
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return json({ error: "Das Enddatum muss nach dem Start liegen" }, { status: 400 });
    if (!await validCampaignScope(client, profile.tenantId, scopeSiteId, scopeAreaId)) return json({ error: "Standort oder Bereich gehört nicht zu diesem Kunden" }, { status: 403 });
    const displayIds = assignments.map((assignment) => assignment.displayId);
    if (new Set(displayIds).size !== displayIds.length) return json({ error: "Ein Ziel-Bildschirm darf nur einmal vorkommen" }, { status: 400 });
    if (assignments.some((assignment) => new Set(assignment.contentItems.map((item) => item.contentId)).size !== assignment.contentItems.length)) return json({ error: "Ein Motiv darf pro Bildschirm nur einmal vorkommen" }, { status: 400 });
    const contentIds = [...new Set(assignments.flatMap((assignment) => assignment.contentItems.map((item) => item.contentId)))];
    const campaign = await client.from("tenant_campaigns").select("id,status").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (campaign.error || !campaign.data) return json({ error: "Kampagne nicht gefunden" }, { status: 404 });
    if (contentIds.length) {
      const available = await client.from("tenant_content").select("id").eq("tenant_id", profile.tenantId).in("id", contentIds);
      if (available.error || available.data?.length !== contentIds.length) return json({ error: "Mindestens ein Motiv gehört nicht zu diesem Kunden" }, { status: 403 });
    }
    let availableDisplays: Array<{ id: string; site_id?: string | null; area_id?: string | null }> = [];
    if (displayIds.length) {
      const available = await client.from("tenant_displays").select("id,site_id,area_id").eq("tenant_id", profile.tenantId).in("id", displayIds);
      if (available.error || available.data?.length !== displayIds.length) return json({ error: "Mindestens ein Bildschirm gehört nicht zu diesem Kunden" }, { status: 403 });
      availableDisplays = available.data;
    }
    if (scopeAreaId && availableDisplays.length) {
      const tenantAreas = await client.from("tenant_areas").select("id,parent_id").eq("tenant_id", profile.tenantId);
      const permittedAreas = new Set([scopeAreaId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const area of tenantAreas.data ?? []) if (area.parent_id && permittedAreas.has(area.parent_id) && !permittedAreas.has(area.id)) { permittedAreas.add(area.id); changed = true; }
      }
      if (availableDisplays.some((display) => !display.area_id || !permittedAreas.has(display.area_id))) return json({ error: "Mindestens ein Ziel liegt ausserhalb des gewählten Bereichs" }, { status: 400 });
    } else if (scopeSiteId && availableDisplays.some((display) => display.site_id !== scopeSiteId)) {
      return json({ error: "Mindestens ein Ziel liegt ausserhalb des gewählten Standorts" }, { status: 400 });
    }
    const previousTargets = await client.from("tenant_campaign_displays").select("display_id").eq("campaign_id", id);
    const removeTargetContent = await client.from("tenant_campaign_display_content").delete().eq("campaign_id", id).eq("tenant_id", profile.tenantId);
    const removeContent = await client.from("tenant_campaign_content").delete().eq("campaign_id", id);
    const removeDisplays = await client.from("tenant_campaign_displays").delete().eq("campaign_id", id);
    if (removeTargetContent.error || removeContent.error || removeDisplays.error) return json({ error: "Die bisherige Konfiguration konnte nicht aktualisiert werden" }, { status: 400 });
    if (contentIds.length) {
      const firstContentConfiguration = new Map<string, { position: number; durationSeconds: number }>();
      for (const assignment of assignments) for (const item of assignment.contentItems) if (!firstContentConfiguration.has(item.contentId)) firstContentConfiguration.set(item.contentId, item);
      const inserted = await client.from("tenant_campaign_content").insert([...firstContentConfiguration].map(([contentId, item], position) => ({ campaign_id: id, content_id: contentId, position, duration_seconds: item.durationSeconds })));
      if (inserted.error) return json({ error: inserted.error.message }, { status: 400 });
    }
    if (displayIds.length) {
      const inserted = await client.from("tenant_campaign_displays").insert(displayIds.map((displayId) => ({ campaign_id: id, display_id: displayId })));
      if (inserted.error) return json({ error: inserted.error.message }, { status: 400 });
    }
    if (totalContentItems) {
      const inserted = await client.from("tenant_campaign_display_content").insert(assignments.flatMap((assignment) => assignment.contentItems.map((item) => ({ tenant_id: profile.tenantId, campaign_id: id, display_id: assignment.displayId, content_id: item.contentId, position: item.position, duration_seconds: item.durationSeconds }))));
      if (inserted.error) return json({ error: inserted.error.message }, { status: 400 });
    }
    await client.from("tenant_campaigns").update({ name, theme, scope_site_id: scopeSiteId, scope_area_id: scopeAreaId, starts_at: startsAt, ends_at: endsAt, updated_at: now }).eq("id", id).eq("tenant_id", profile.tenantId);
    await bumpDisplayConfigurations(client, [...(previousTargets.data ?? []).map((entry) => entry.display_id), ...displayIds]);
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "configure", entity_type: "campaign", entity_id: id, metadata: { contentCount: contentIds.length, displayCount: displayIds.length, targetedContentCount: totalContentItems } });
    return json({ ok: true });
  }

  if (action === "activate_campaign") {
    const id = cleanText(body.id, 80);
    if (!id) return json({ error: "Kampagne fehlt" }, { status: 400 });
    const campaign = await client.from("tenant_campaigns").select("id,status,starts_at,ends_at").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (campaign.error || !campaign.data) return json({ error: "Kampagne nicht gefunden" }, { status: 404 });
    if (["completed", "archived"].includes(campaign.data.status)) return json({ error: "Diese Kampagne ist abgeschlossen" }, { status: 409 });
    const [contentLinks, displayLinks, targetContentLinks] = await Promise.all([
      client.from("tenant_campaign_content").select("content_id,content:tenant_content(status)").eq("campaign_id", id),
      client.from("tenant_campaign_displays").select("display_id").eq("campaign_id", id),
      client.from("tenant_campaign_display_content").select("display_id,content_id,content:tenant_content(status)").eq("campaign_id", id).eq("tenant_id", profile.tenantId),
    ]);
    if (!contentLinks.data?.length) return json({ error: "Fügen Sie der Kampagne mindestens ein Motiv hinzu" }, { status: 409 });
    const unapproved = contentLinks.data.some((link) => {
      const relation = Array.isArray(link.content) ? link.content[0] : link.content;
      return !relation || !["approved", "published"].includes(relation.status);
    });
    if (unapproved) return json({ error: "Geben Sie alle gewählten Motive vor dem Start frei" }, { status: 409 });
    if (!displayLinks.data?.length) return json({ error: "Wählen Sie mindestens einen Bildschirm aus" }, { status: 409 });
    const configuredTargets = new Set((targetContentLinks.data ?? []).map((link) => link.display_id));
    const missingTarget = displayLinks.data.find((link) => !configuredTargets.has(link.display_id));
    if (missingTarget) return json({ error: "Weisen Sie jedem gewählten Bildschirm mindestens ein Motiv zu" }, { status: 409 });
    const unapprovedTargetContent = (targetContentLinks.data ?? []).some((link) => {
      const relation = Array.isArray(link.content) ? link.content[0] : link.content;
      return !relation || !["approved", "published"].includes(relation.status);
    });
    if (unapprovedTargetContent) return json({ error: "Geben Sie alle zielbezogenen Motive vor dem Start frei" }, { status: 409 });
    if (campaign.data.ends_at && new Date(campaign.data.ends_at).getTime() <= Date.now()) return json({ error: "Das Enddatum liegt bereits in der Vergangenheit" }, { status: 409 });
    const nextStatus = campaign.data.starts_at && new Date(campaign.data.starts_at).getTime() > Date.now() ? "scheduled" : "active";
    const result = await client.from("tenant_campaigns").update({ status: nextStatus, updated_at: now }).eq("id", id).eq("tenant_id", profile.tenantId).select("id,status").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    const targets = await client.from("tenant_campaign_displays").select("display_id").eq("campaign_id", id);
    await bumpDisplayConfigurations(client, (targets.data ?? []).map((entry) => entry.display_id));
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: nextStatus === "active" ? "activate" : "schedule", entity_type: "campaign", entity_id: id });
    return json({ ok: true, record: result.data });
  }

  if (action === "pause_campaign") {
    const id = cleanText(body.id, 80);
    const result = await client.from("tenant_campaigns").update({ status: "paused", updated_at: now }).eq("id", id).eq("tenant_id", profile.tenantId).in("status", ["active", "scheduled"]).select("id,status").maybeSingle();
    if (result.error || !result.data) return json({ error: "Nur aktive oder geplante Kampagnen können pausiert werden" }, { status: 409 });
    const targets = await client.from("tenant_campaign_displays").select("display_id").eq("campaign_id", id);
    await bumpDisplayConfigurations(client, (targets.data ?? []).map((entry) => entry.display_id));
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "pause", entity_type: "campaign", entity_id: id });
    return json({ ok: true, record: result.data });
  }

  if (action === "update_campaign_status") {
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 30);
    if (!id || !["draft", "review", "archived"].includes(status)) {
      return json({ error: "Ungültige Statusänderung" }, { status: 400 });
    }
    const result = await client.from("tenant_campaigns").update({ status, updated_at: now })
      .eq("id", id).eq("tenant_id", profile.tenantId)
      .select("id,name,status,starts_at,ends_at,schedule,created_at,updated_at").single();
    if (result.error) return json({ error: "Kampagne nicht gefunden oder Zugriff verweigert" }, { status: 404 });
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "status_change", entity_type: "campaign", entity_id: result.data.id, metadata: { status } });
    return json({ ok: true, record: result.data });
  }

  if (action === "delete_campaign") {
    const id = cleanText(body.id, 80);
    if (!id) return json({ error: "Kampagne fehlt" }, { status: 400 });
    const existing = await client.from("tenant_campaigns").select("id,name,status").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (existing.error || !existing.data) return json({ error: "Kampagne nicht gefunden" }, { status: 404 });
    if (cleanText(body.confirmationName, 180) !== existing.data.name) return json({ error: "Der eingegebene Name stimmt nicht überein" }, { status: 409 });
    const targets = await client.from("tenant_campaign_displays").select("display_id").eq("campaign_id", id);
    const removed = await client.from("tenant_campaigns").delete().eq("id", id).eq("tenant_id", profile.tenantId);
    if (removed.error) return json({ error: "Kampagne konnte nicht gelöscht werden" }, { status: 400 });
    await bumpDisplayConfigurations(client, (targets.data ?? []).map((entry) => entry.display_id));
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "delete", entity_type: "campaign", entity_id: id, metadata: { name: existing.data.name, previousStatus: existing.data.status } });
    return json({ ok: true });
  }

  return json({ error: "Unbekannte Portal-Aktion" }, { status: 400 });
}

function amount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(Math.min(parsed, 1_000_000_000) * 100) / 100) : 0;
}

function optionalEmail(value: unknown): string | null | undefined {
  const email = cleanText(value, 200).toLowerCase();
  if (!email) return null;
  return validEmail(email) ? email : undefined;
}

function optionalDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const paymentActions = {
  deposit_50: { field: "deposit_received", nextStage: "planning", label: "50-%-Anzahlung" },
  installation_30: { field: "installation_payment_received", nextStage: "configuration", label: "30-%-Montagezahlung" },
  acceptance_20: { field: "final_payment_received", nextStage: "completed", label: "20-%-Schlusszahlung" },
} as const;

function approvalColumn(email: string): "marcel_approved_at" | "thomas_approved_at" | null {
  if (email === "kontakt@swisscompact.com") return "marcel_approved_at";
  if (email === "thomas.peter@swisscompact.com") return "thomas_approved_at";
  return null;
}

function quoteItems(value: unknown): Array<{ description: string; quantity: number; unit: string; unitPriceChf: number; totalChf: number }> | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) return null;
  const parsed = value.map((entry) => {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const description = cleanText(item.description, 300);
    const quantity = Math.min(100_000, Math.max(0.01, Math.round(Number(item.quantity) * 100) / 100));
    const unit = cleanText(item.unit, 40) || "Stk.";
    const unitPriceChf = amount(item.unitPriceChf);
    return { description, quantity, unit, unitPriceChf, totalChf: Math.round(quantity * unitPriceChf * 100) / 100 };
  });
  return parsed.every((item) => item.description && Number.isFinite(item.quantity) && item.unitPriceChf >= 0) ? parsed : null;
}

export async function POST(request: Request): Promise<Response> {
  const search = new URL(request.url).searchParams;
  const portalAi = search.get("portalAi");
  if (portalAi === "image") return handleAiImagePost(request);
  if (portalAi === "credits") return handleAiCreditsPost(request);
  if (search.get("integration") === "stripe-webhook") return handleStripeWebhookPost(request);
  const deviceMode = search.get("device");
  if (deviceMode) return handleDevicePost(request, deviceMode);
  if (search.get("public") === "quote") return postPublicQuote(request);
  const guard = validatePublicPost(request, {
    key: "dashboard-records",
    limit: 80,
    windowMs: 10 * 60_000,
    contentTypes: ["application/json"],
    maxBytes: 32_000,
  });
  if (guard) return guard;
  if (new URL(request.url).searchParams.get("audience") === "portal") return handlePortalRecords(request);
  const authorized = await authorizeDashboard(request);
  if (isResponse(authorized)) return authorized;
  const { client, profile } = authorized;
  const body = await request.json() as Payload;
  const action = cleanText(body.action, 80);

  if (action === "create_client") {
    const email = optionalEmail(body.email);
    if (email === undefined) return json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
    const record = {
      company_name: cleanText(body.companyName, 200),
      contact_name: cleanText(body.contactName, 200) || null,
      email,
      phone: cleanText(body.phone, 80) || null,
      lifecycle: "lead",
      created_by: profile.userId,
    };
    if (!record.company_name) return json({ error: "Firmenname fehlt" }, { status: 400 });
    const result = await client.from("clients").insert(record).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "create", "client", result.data.id, undefined, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "update_client") {
    const id = cleanText(body.id, 80);
    const email = optionalEmail(body.email);
    const lifecycle = cleanText(body.lifecycle, 40);
    if (!id) return json({ error: "Kunde fehlt" }, { status: 400 });
    if (email === undefined) return json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
    if (!["lead", "prospect", "customer", "inactive"].includes(lifecycle)) {
      return json({ error: "Ungültiger Kundenstatus" }, { status: 400 });
    }
    const previous = await client.from("clients").select("*").eq("id", id).single();
    if (previous.error) return json({ error: previous.error.message }, { status: 404 });
    const update = {
      company_name: cleanText(body.companyName, 200),
      contact_name: cleanText(body.contactName, 200) || null,
      email,
      phone: cleanText(body.phone, 80) || null,
      address_line: cleanText(body.addressLine, 240) || null,
      postal_code: cleanText(body.postalCode, 30) || null,
      city: cleanText(body.city, 120) || null,
      lifecycle,
      notes: cleanText(body.notes, 20_000) || null,
      updated_at: new Date().toISOString(),
    };
    if (!update.company_name) return json({ error: "Firmenname fehlt" }, { status: 400 });
    const result = await client.from("clients").update(update).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "update", "client", id, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "create_opportunity") {
    const record = {
      client_id: typeof body.clientId === "string" && body.clientId ? body.clientId : null,
      title: cleanText(body.title, 240),
      stage: "request",
      owner_area: ["marcel", "thomas", "shared", "ai"].includes(String(body.ownerArea)) ? body.ownerArea : "shared",
      value_chf: amount(body.valueChf),
      probability: 20,
      next_action: cleanText(body.nextAction, 500) || null,
      created_by: profile.userId,
    };
    if (!record.title) return json({ error: "Titel fehlt" }, { status: 400 });
    const result = await client.from("opportunities").insert(record).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "create", "opportunity", result.data.id, undefined, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "move_opportunity") {
    const id = cleanText(body.id, 80);
    const stage = cleanText(body.stage, 80);
    const allowed = [
      "request","qualification","consulting","customer_decision","quote","confirmed","deposit_50","planning",
      "hardware_concept","software_development","procurement","installation","installation_30","configuration",
      "acceptance","final_invoice_20","completed","maintenance","paused","lost","cancelled",
    ];
    if (!id || !allowed.includes(stage)) return json({ error: "Ungültiger Statuswechsel" }, { status: 400 });
    const previous = await client.from("opportunities").select("*").eq("id", id).single();
    if (previous.error) return json({ error: previous.error.message }, { status: 404 });
    const result = await client.from("opportunities").update({ stage, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "stage_change", "opportunity", id, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "update_opportunity") {
    const id = cleanText(body.id, 80);
    const stage = cleanText(body.stage, 80);
    const ownerArea = cleanText(body.ownerArea, 40);
    const probability = Math.min(100, Math.max(0, Math.round(Number(body.probability) || 0)));
    const allowedStages = [
      "request","qualification","consulting","customer_decision","quote","confirmed","deposit_50","planning",
      "hardware_concept","software_development","procurement","installation","installation_30","configuration",
      "acceptance","final_invoice_20","completed","maintenance","paused","lost","cancelled",
    ];
    if (!id || !allowedStages.includes(stage)) return json({ error: "Ungültige Chance" }, { status: 400 });
    if (!["marcel", "thomas", "shared", "ai"].includes(ownerArea)) return json({ error: "Ungültige Verantwortung" }, { status: 400 });
    const previous = await client.from("opportunities").select("*").eq("id", id).single();
    if (previous.error) return json({ error: previous.error.message }, { status: 404 });
    const update = {
      client_id: typeof body.clientId === "string" && body.clientId ? body.clientId : null,
      title: cleanText(body.title, 240),
      stage,
      owner_area: ownerArea,
      value_chf: amount(body.valueChf),
      probability,
      expected_close: typeof body.expectedClose === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.expectedClose) ? body.expectedClose : null,
      next_action: cleanText(body.nextAction, 1000) || null,
      next_action_at: optionalDate(body.nextActionAt),
      updated_at: new Date().toISOString(),
    };
    if (!update.title) return json({ error: "Titel fehlt" }, { status: 400 });
    const result = await client.from("opportunities").update(update).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "update", "opportunity", id, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "create_quote" || action === "update_quote") {
    const items = quoteItems(body.items);
    const validUntil = typeof body.validUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.validUntil) ? body.validUntil : null;
    if (!items) return json({ error: "Mindestens eine gültige Offertenposition ist erforderlich" }, { status: 400 });
    if (!validUntil) return json({ error: "Gültigkeitsdatum fehlt" }, { status: 400 });
    const subtotal = Math.round(items.reduce((sum, item) => sum + item.totalChf, 0) * 100) / 100;
    const record = {
      client_id: typeof body.clientId === "string" && body.clientId ? body.clientId : null,
      opportunity_id: typeof body.opportunityId === "string" && body.opportunityId ? body.opportunityId : null,
      status: "draft",
      currency: "CHF",
      subtotal,
      total: subtotal,
      valid_until: validUntil,
      items,
      terms: cleanText(body.terms, 5000) || "Zahlungsplan Projektauftrag: 50 % vor Projektstart, 30 % bei Montagebeginn und 20 % nach unterzeichneter Kundenabnahme. Zahlungsziel 14 Tage. Software-Abonnements werden separat monatlich verrechnet.",
      updated_at: new Date().toISOString(),
    };
    if (!record.client_id) return json({ error: "Kunde fehlt" }, { status: 400 });
    if (record.opportunity_id) {
      const opportunity = await client.from("opportunities").select("client_id").eq("id", record.opportunity_id).single();
      if (opportunity.error || opportunity.data.client_id !== record.client_id) return json({ error: "Chance und Kunde passen nicht zusammen" }, { status: 400 });
    }
    if (action === "create_quote") {
      const result = await client.from("quotes").insert(record).select("*").single();
      if (result.error) return json({ error: result.error.message }, { status: 400 });
      if (record.opportunity_id) await client.from("opportunities").update({ stage: "quote", value_chf: subtotal, probability: 60, updated_at: new Date().toISOString() }).eq("id", record.opportunity_id);
      await writeAudit(client, profile, "create", "quote", result.data.id, undefined, result.data);
      return json({ ok: true, record: result.data });
    }
    const id = cleanText(body.id, 80);
    const previous = await client.from("quotes").select("*").eq("id", id).single();
    if (previous.error) return json({ error: "Offerte nicht gefunden" }, { status: 404 });
    if (["sent", "viewed", "accepted", "declined", "expired"].includes(previous.data.status)) return json({ error: "Eine versendete oder abgeschlossene Offerte kann nicht mehr verändert werden" }, { status: 409 });
    const result = await client.from("quotes").update(record).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await client.from("approvals").update({ invalidated_at: new Date().toISOString() }).eq("entity_id", id).eq("action", "quote_approval").is("invalidated_at", null);
    if (record.opportunity_id) await client.from("opportunities").update({ value_chf: subtotal, updated_at: new Date().toISOString() }).eq("id", record.opportunity_id);
    await writeAudit(client, profile, "update", "quote", id, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "request_quote_approval") {
    const quoteId = cleanText(body.quoteId, 80);
    const column = approvalColumn(profile.email);
    if (!quoteId || !column) return json({ error: "Ungültige Offertenfreigabe" }, { status: 400 });
    const quote = await client.from("quotes").select("*").eq("id", quoteId).single();
    if (quote.error) return json({ error: "Offerte nicht gefunden" }, { status: 404 });
    if (!["draft", "approval"].includes(quote.data.status)) return json({ error: "Diese Offerte kann nicht freigegeben werden" }, { status: 409 });
    const contentHash = createHash("sha256").update(JSON.stringify({ clientId: quote.data.client_id, opportunityId: quote.data.opportunity_id, items: quote.data.items, total: quote.data.total, validUntil: quote.data.valid_until, terms: quote.data.terms, updatedAt: quote.data.updated_at })).digest("hex");
    const existing = await client.from("approvals").select("*").eq("entity_id", quoteId).eq("action", "quote_approval").is("invalidated_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing.error) return json({ error: existing.error.message }, { status: 400 });
    let current = existing.data;
    if (current && current.content_hash !== contentHash) {
      await client.from("approvals").update({ invalidated_at: new Date().toISOString() }).eq("id", current.id);
      current = null;
    }
    if (!current) {
      const created = await client.from("approvals").insert({ entity_type: "quote", entity_id: quoteId, action: "quote_approval", content_hash: contentHash, requested_by: profile.userId, [column]: new Date().toISOString() }).select("*").single();
      if (created.error) return json({ error: created.error.message }, { status: 400 });
      current = created.data;
      await client.from("quotes").update({ status: "approval" }).eq("id", quoteId);
    } else if (!current[column]) {
      const approved = await client.from("approvals").update({ [column]: new Date().toISOString() }).eq("id", current.id).select("*").single();
      if (approved.error) return json({ error: approved.error.message }, { status: 400 });
      current = approved.data;
    }
    const fullyApproved = Boolean(current.marcel_approved_at && current.thomas_approved_at);
    if (fullyApproved && !current.executed_at) await client.from("approvals").update({ executed_at: new Date().toISOString() }).eq("id", current.id);
    await writeAudit(client, profile, fullyApproved ? "dual_approval_executed" : "approval_recorded", "quote", quoteId, undefined, { approvalId: current.id, total: quote.data.total, fullyApproved });
    return json({ ok: true, approval: current, approved: fullyApproved });
  }

  if (action === "publish_quote") {
    const quoteId = cleanText(body.quoteId, 80);
    if (!quoteId) return json({ error: "Offerte fehlt" }, { status: 400 });
    const quote = await client.from("quotes").select("*").eq("id", quoteId).single();
    if (quote.error) return json({ error: "Offerte nicht gefunden" }, { status: 404 });
    if (["accepted", "declined", "expired"].includes(quote.data.status)) return json({ error: "Diese Offerte ist bereits abgeschlossen" }, { status: 409 });
    const approval = await client.from("approvals").select("*").eq("entity_id", quoteId).eq("action", "quote_approval").is("invalidated_at", null).not("executed_at", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (approval.error || !approval.data?.marcel_approved_at || !approval.data?.thomas_approved_at) return json({ error: "Vor dem Versand müssen Marcel und Thomas freigeben" }, { status: 409 });
    const customer = await client.from("clients").select("*").eq("id", quote.data.client_id).single();
    if (customer.error || !customer.data?.email || !validEmail(customer.data.email)) return json({ error: "Beim Kunden ist keine gültige E-Mail-Adresse hinterlegt" }, { status: 409 });

    const pdf = await createQuotePdf(quote.data, customer.data);
    const documentHash = createHash("sha256").update(pdf).digest("hex");
    const pdfPath = `quotes/${quote.data.quote_number}/${documentHash}.pdf`;
    const upload = await client.storage.from("swisscompact-documents").upload(pdfPath, pdf, { contentType: "application/pdf", upsert: false });
    if (upload.error && !/already exists/i.test(upload.error.message)) return json({ error: `PDF konnte nicht gespeichert werden: ${upload.error.message}` }, { status: 503 });

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const validUntilEnd = new Date(`${quote.data.valid_until}T23:59:59.999+02:00`);
    const maximum = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    const expiresAt = new Date(Math.min(validUntilEnd.getTime(), maximum.getTime()));
    if (expiresAt.getTime() <= Date.now()) return json({ error: "Das Gültigkeitsdatum der Offerte ist bereits abgelaufen" }, { status: 409 });
    await client.from("quote_access_tokens").update({ revoked_at: new Date().toISOString() }).eq("quote_id", quoteId).is("revoked_at", null).is("accepted_at", null);
    const access = await client.from("quote_access_tokens").insert({ quote_id: quoteId, token_hash: tokenHash, recipient_email: customer.data.email.toLowerCase(), expires_at: expiresAt.toISOString(), created_by: profile.userId }).select("id").single();
    if (access.error) return json({ error: access.error.message }, { status: 400 });

    const origin = new URL(request.url).origin;
    const acceptanceUrl = `${origin}/offerte/${token}`;
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      await client.from("quote_access_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", access.data.id);
      return json({ error: "RESEND_API_KEY fehlt. Die Offerte wurde sicher erstellt, aber noch nicht versendet." }, { status: 503 });
    }
    const mail = await new Resend(resendKey).emails.send({
      from: "SwissCompact <kontakt@swisscompact.com>",
      to: customer.data.email,
      replyTo: "kontakt@swisscompact.com",
      subject: `Ihre Offerte ${quote.data.quote_number} von SwissCompact`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#18181b"><p style="color:#c8102e;font-weight:800;letter-spacing:.12em">SWISSCOMPACT</p><h1 style="font-size:30px">Ihre Offerte ist bereit.</h1><p>Guten Tag ${escapeHtml(customer.data.contact_name || customer.data.company_name)},</p><p>Sie können die Offerte <strong>${escapeHtml(quote.data.quote_number)}</strong> über den sicheren Link ansehen und digital annehmen.</p><p style="margin:30px 0"><a href="${acceptanceUrl}" style="display:inline-block;padding:15px 22px;background:#d70b31;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Offerte sicher öffnen</a></p><p style="font-size:13px;color:#666">Der Link ist persönlich, nicht übertragbar und bis ${escapeHtml(expiresAt.toLocaleDateString("de-CH"))} gültig.</p><p>Freundliche Grüsse<br>Marcel Spahr und Thomas Peter<br>SwissCompact</p></div>`,
      attachments: [{ filename: `${quote.data.quote_number}.pdf`, content: Buffer.from(pdf).toString("base64") }],
    });
    if (mail.error) {
      await client.from("quote_access_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", access.data.id);
      return json({ error: `E-Mail-Versand fehlgeschlagen: ${mail.error.message}` }, { status: 503 });
    }
    const updated = await client.from("quotes").update({ status: "sent", immutable_pdf_path: pdfPath, document_hash: documentHash, updated_at: new Date().toISOString() }).eq("id", quoteId).select("*").single();
    if (updated.error) return json({ error: updated.error.message }, { status: 400 });
    await writeAudit(client, profile, "quote_published", "quote", quoteId, quote.data, { status: "sent", documentHash, recipient: customer.data.email, accessId: access.data.id });
    return json({ ok: true, record: updated.data, acceptanceUrl, expiresAt: expiresAt.toISOString() });
  }

  if (action === "create_project_from_opportunity") {
    const opportunityId = cleanText(body.opportunityId, 80);
    const allowedStages = ["confirmed", "deposit_50", "planning", "hardware_concept", "software_development", "procurement", "installation", "installation_30", "configuration", "acceptance", "final_invoice_20"];
    const opportunity = await client.from("opportunities").select("*").eq("id", opportunityId).single();
    if (opportunity.error) return json({ error: "Auftrag nicht gefunden" }, { status: 404 });
    if (!opportunity.data.client_id) return json({ error: "Vor der Projektanlage muss ein Kunde zugeordnet sein" }, { status: 400 });
    if (!allowedStages.includes(opportunity.data.stage)) return json({ error: "Ein Projekt kann erst nach bestätigtem Auftrag angelegt werden" }, { status: 409 });
    const existing = await client.from("projects").select("id,order_number").eq("opportunity_id", opportunityId).maybeSingle();
    if (existing.data) return json({ error: `Projekt ${existing.data.order_number} existiert bereits` }, { status: 409 });
    const profiles = await client.from("dashboard_profiles").select("user_id,email").eq("active", true);
    if (profiles.error) return json({ error: profiles.error.message }, { status: 400 });
    const marcel = profiles.data?.find((entry) => entry.email === "kontakt@swisscompact.com")?.user_id ?? null;
    const thomas = profiles.data?.find((entry) => entry.email === "thomas.peter@swisscompact.com")?.user_id ?? null;
    const project = await client.from("projects").insert({
      opportunity_id: opportunityId,
      client_id: opportunity.data.client_id,
      title: opportunity.data.title,
      status: "planning",
      software_owner: marcel,
      hardware_owner: thomas,
      starts_on: typeof body.startsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startsOn) ? body.startsOn : null,
      target_completion: typeof body.targetCompletion === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.targetCompletion) ? body.targetCompletion : null,
    }).select("*").single();
    if (project.error) return json({ error: project.error.message }, { status: 400 });
    await Promise.all([
      client.from("opportunities").update({ stage: "deposit_50", updated_at: new Date().toISOString() }).eq("id", opportunityId),
      client.from("clients").update({ lifecycle: "customer", updated_at: new Date().toISOString() }).eq("id", opportunity.data.client_id),
      client.from("tasks").insert({ project_id: project.data.id, title: "50-%-Anzahlung prüfen und gemeinsam bestätigen", responsibility: "shared", priority: "urgent", status: "open" }),
    ]);
    await writeAudit(client, profile, "create_from_order", "project", project.data.id, opportunity.data, project.data);
    return json({ ok: true, record: project.data });
  }

  if (action === "update_project") {
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 40);
    if (!id || !["planning", "active", "blocked", "acceptance", "completed", "cancelled"].includes(status)) {
      return json({ error: "Ungültiger Projektstatus" }, { status: 400 });
    }
    const previous = await client.from("projects").select("*").eq("id", id).single();
    if (previous.error) return json({ error: previous.error.message }, { status: 404 });
    if (status === "active" && !previous.data.deposit_received) return json({ error: "Projektstart ist erst nach bestätigter 50-%-Anzahlung möglich" }, { status: 409 });
    if (status === "acceptance" && !previous.data.installation_payment_received) return json({ error: "Abnahme ist erst nach bestätigter Montagezahlung möglich" }, { status: 409 });
    if (status === "completed" && !previous.data.final_payment_received) return json({ error: "Abschluss ist erst nach bestätigter Schlusszahlung möglich" }, { status: 409 });
    const allowedOwners = await client.from("dashboard_profiles").select("user_id").eq("active", true);
    const ownerIds = new Set((allowedOwners.data ?? []).map((entry) => entry.user_id));
    const softwareOwner = typeof body.softwareOwner === "string" && ownerIds.has(body.softwareOwner) ? body.softwareOwner : null;
    const hardwareOwner = typeof body.hardwareOwner === "string" && ownerIds.has(body.hardwareOwner) ? body.hardwareOwner : null;
    const update = {
      title: cleanText(body.title, 240),
      status,
      software_owner: softwareOwner,
      hardware_owner: hardwareOwner,
      starts_on: typeof body.startsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startsOn) ? body.startsOn : null,
      target_completion: typeof body.targetCompletion === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.targetCompletion) ? body.targetCompletion : null,
      updated_at: new Date().toISOString(),
    };
    if (!update.title) return json({ error: "Projekttitel fehlt" }, { status: 400 });
    const result = await client.from("projects").update(update).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await client.from("approvals").update({ invalidated_at: new Date().toISOString() }).eq("entity_id", id).is("executed_at", null).is("invalidated_at", null);
    await writeAudit(client, profile, "update", "project", id, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "request_project_payment_approval" || action === "approve_project_payment") {
    const projectId = cleanText(body.projectId, 80);
    const payment = cleanText(body.payment, 40) as keyof typeof paymentActions;
    const config = paymentActions[payment];
    const column = approvalColumn(profile.email);
    if (!projectId || !config || !column) return json({ error: "Ungültige Zahlungsfreigabe" }, { status: 400 });
    const project = await client.from("projects").select("*").eq("id", projectId).single();
    if (project.error) return json({ error: "Projekt nicht gefunden" }, { status: 404 });
    if (project.data[config.field]) return json({ ok: true, alreadyExecuted: true });
    if (payment === "installation_30" && !project.data.deposit_received) return json({ error: "Zuerst muss die 50-%-Anzahlung bestätigt werden" }, { status: 409 });
    if (payment === "installation_30" && project.data.opportunity_id) {
      const opportunity = await client.from("opportunities").select("stage").eq("id", project.data.opportunity_id).single();
      const montageStages = ["installation", "installation_30", "configuration", "acceptance", "final_invoice_20", "completed", "maintenance"];
      if (opportunity.error || !montageStages.includes(opportunity.data.stage)) {
        return json({ error: "Die 30-%-Zahlung wird erst zum Beginn der Montage freigeschaltet" }, { status: 409 });
      }
    }
    if (payment === "acceptance_20" && (!project.data.installation_payment_received || project.data.status !== "acceptance")) {
      return json({ error: "Schlusszahlung erst nach Montagezahlung und Kundenabnahme bestätigen" }, { status: 409 });
    }
    const contentHash = createHash("sha256").update(`${projectId}:${payment}:${project.data.updated_at}`).digest("hex");
    let approval;
    if (action === "approve_project_payment") {
      const approvalId = cleanText(body.approvalId, 80);
      approval = await client.from("approvals").select("*").eq("id", approvalId).eq("entity_id", projectId).eq("action", payment).is("invalidated_at", null).single();
      if (approval.error) return json({ error: "Freigabe nicht gefunden oder nicht mehr gültig" }, { status: 404 });
      if (approval.data.content_hash !== contentHash) {
        await client.from("approvals").update({ invalidated_at: new Date().toISOString() }).eq("id", approval.data.id);
        return json({ error: "Das Projekt wurde seit der ersten Freigabe geändert. Bitte neu freigeben." }, { status: 409 });
      }
    } else {
      const existing = await client.from("approvals").select("*").eq("entity_id", projectId).eq("action", payment).is("invalidated_at", null).is("executed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existing.error) return json({ error: existing.error.message }, { status: 400 });
      if (existing.data?.content_hash === contentHash) approval = existing;
      else {
        if (existing.data) await client.from("approvals").update({ invalidated_at: new Date().toISOString() }).eq("id", existing.data.id);
        approval = await client.from("approvals").insert({ entity_type: "project", entity_id: projectId, action: payment, content_hash: contentHash, requested_by: profile.userId, [column]: new Date().toISOString() }).select("*").single();
      }
    }
    if (approval.error || !approval.data) return json({ error: approval.error?.message || "Freigabe konnte nicht erstellt werden" }, { status: 400 });
    let current = approval.data;
    if (!current[column]) {
      const updated = await client.from("approvals").update({ [column]: new Date().toISOString() }).eq("id", current.id).select("*").single();
      if (updated.error) return json({ error: updated.error.message }, { status: 400 });
      current = updated.data;
    }
    const fullyApproved = Boolean(current.marcel_approved_at && current.thomas_approved_at);
    if (fullyApproved && !current.executed_at) {
      const projectUpdate: Record<string, unknown> = { [config.field]: true, updated_at: new Date().toISOString() };
      if (payment === "deposit_50") projectUpdate.status = "active";
      if (payment === "acceptance_20") projectUpdate.status = "completed";
      const executed = await client.from("projects").update(projectUpdate).eq("id", projectId).select("*").single();
      if (executed.error) return json({ error: executed.error.message }, { status: 400 });
      await client.from("approvals").update({ executed_at: new Date().toISOString() }).eq("id", current.id);
      await client.from("invoices").update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("project_id", projectId).eq("installment", payment).in("status", ["draft", "approval", "sent", "partially_paid", "overdue"]);
      if (project.data.opportunity_id) await client.from("opportunities").update({ stage: config.nextStage, updated_at: new Date().toISOString() }).eq("id", project.data.opportunity_id);
      if (payment === "deposit_50") await client.from("tasks").insert([
        { project_id: projectId, title: "Projekt-Kickoff und Detailplanung durchführen", responsibility: "marcel", priority: "high", status: "open" },
        { project_id: projectId, title: "Hardware- und Montagekonzept ausarbeiten", responsibility: "thomas", priority: "high", status: "open" },
        { project_id: projectId, title: "Software-, UX- und Inhaltskonzept ausarbeiten", responsibility: "marcel", priority: "high", status: "open" },
      ]);
      if (payment === "deposit_50") await client.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("project_id", projectId).eq("title", "50-%-Anzahlung prüfen und gemeinsam bestätigen");
      await writeAudit(client, profile, "dual_approval_executed", "project_payment", projectId, project.data, { payment, label: config.label });
    } else {
      await writeAudit(client, profile, "approval_recorded", "project_payment", projectId, undefined, { payment, approvalId: current.id, fullyApproved });
    }
    return json({ ok: true, approval: current, executed: fullyApproved });
  }

  if (action === "invoice_document_url") {
    const invoiceId = cleanText(body.invoiceId, 80);
    if (!invoiceId) return json({ error: "Rechnung fehlt" }, { status: 400 });
    const invoice = await client.from("invoices").select("id,invoice_number,immutable_pdf_path").eq("id", invoiceId).single();
    if (invoice.error || !invoice.data?.immutable_pdf_path) return json({ error: "Für diese Rechnung ist noch kein PDF verfügbar" }, { status: 404 });
    const signed = await client.storage.from("swisscompact-documents").createSignedUrl(invoice.data.immutable_pdf_path, 10 * 60);
    if (signed.error || !signed.data?.signedUrl) return json({ error: "Rechnungsdokument konnte nicht geöffnet werden" }, { status: 503 });
    await writeAudit(client, profile, "document_opened", "invoice", invoiceId, undefined, { invoiceNumber: invoice.data.invoice_number });
    return json({ ok: true, url: signed.data.signedUrl, expiresIn: 600 });
  }

  if (action === "create_task") {
    const record = {
      title: cleanText(body.title, 240),
      description: cleanText(body.description, 1200) || null,
      responsibility: ["marcel", "thomas", "shared", "ai"].includes(String(body.responsibility)) ? body.responsibility : "shared",
      status: "open",
      priority: ["low", "normal", "high", "urgent"].includes(String(body.priority)) ? body.priority : "normal",
      due_at: optionalDate(body.dueAt),
      project_id: typeof body.projectId === "string" && body.projectId ? body.projectId : null,
      opportunity_id: typeof body.opportunityId === "string" && body.opportunityId ? body.opportunityId : null,
    };
    if (!record.title) return json({ error: "Aufgabentitel fehlt" }, { status: 400 });
    const result = await client.from("tasks").insert(record).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "create", "task", result.data.id, undefined, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "complete_task") {
    const id = cleanText(body.id, 80);
    const previous = await client.from("tasks").select("*").eq("id", id).single();
    if (previous.error) return json({ error: previous.error.message }, { status: 404 });
    const result = await client.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "complete", "task", id, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "update_task_status") {
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 40);
    if (!id || !["open", "in_progress", "waiting", "done", "cancelled"].includes(status)) return json({ error: "Ungültiger Aufgabenstatus" }, { status: 400 });
    const previous = await client.from("tasks").select("*").eq("id", id).single();
    if (previous.error) return json({ error: previous.error.message }, { status: 404 });
    const result = await client.from("tasks").update({ status, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "status_change", "task", id, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "update_founder_transaction") {
    const id = cleanText(body.id, 80);
    const category = cleanText(body.category, 160);
    const previous = await client.from("founder_transactions").select("*").eq("id", id).single();
    if (previous.error) return json({ error: previous.error.message }, { status: 404 });
    const result = await client.from("founder_transactions").update({ category: category || null }).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "categorize", "founder_transaction", id, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  return json({ error: "Unbekannte Aktion" }, { status: 400 });
}

export async function GET(request: Request): Promise<Response> {
  const search = new URL(request.url).searchParams;
  if (search.get("portalAi") === "credits") return handleAiCreditsStatusGet(request);
  if (search.get("portalPreview")) return handlePortalPlayerPreview(request, cleanText(search.get("portalPreview"), 80));
  if (search.get("device") === "config") return handleDeviceConfig(request);
  if (search.get("public") === "quote") return getPublicQuote(request);
  return json({ error: "Nicht gefunden" }, { status: 404 });
}
