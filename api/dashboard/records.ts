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
import { createMuxDirectUpload, deleteMuxAsset, deleteMuxDirectUpload, getMuxDirectUpload, muxSignedPlaybackUrl, muxVideoEnabled } from "../_lib/portal/mux-video.js";
import { handleMuxWebhookPost } from "../_lib/portal/mux-webhook-handler.js";
import { handlePartnerNetworkAction } from "../_lib/portal/partner-network.js";

export const config = { runtime: "nodejs", maxDuration: 180 };

type Payload = Record<string, unknown>;

const PORTAL_MEDIA_BUCKET = "swisscompact-media";
const MUX_VIDEO_MAX_BYTES = 5 * 1024 * 1024 * 1024;
const PORTAL_MEDIA_TYPES: Record<string, { type: "image" | "video"; extension: string; maxBytes: number }> = {
  "image/jpeg": { type: "image", extension: "jpg", maxBytes: 20 * 1024 * 1024 },
  "image/png": { type: "image", extension: "png", maxBytes: 20 * 1024 * 1024 },
  "image/webp": { type: "image", extension: "webp", maxBytes: 20 * 1024 * 1024 },
  "video/mp4": { type: "video", extension: "mp4", maxBytes: 250 * 1024 * 1024 },
  "video/webm": { type: "video", extension: "webm", maxBytes: 250 * 1024 * 1024 },
  "video/quicktime": { type: "video", extension: "mov", maxBytes: MUX_VIDEO_MAX_BYTES },
  "video/x-matroska": { type: "video", extension: "mkv", maxBytes: MUX_VIDEO_MAX_BYTES },
};
const PROJECT_FILE_TYPES: Record<string, { extension: string; maxBytes: number; kind: "image" | "video" | "document" }> = {
  ...Object.fromEntries(Object.entries(PORTAL_MEDIA_TYPES).map(([mime, config]) => [mime, { extension: config.extension, maxBytes: Math.min(config.maxBytes, 250 * 1024 * 1024), kind: config.type }])),
  "application/pdf": { extension: "pdf", maxBytes: 20 * 1024 * 1024, kind: "document" },
};

function normalizedMediaMetadata(value: unknown, type: "image" | "video"): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const width = Math.round(Number(candidate.width));
  const height = Math.round(Number(candidate.height));
  const durationSeconds = Number(candidate.durationSeconds);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 32768 || height > 32768) return null;
  if (type === "video" && (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 86400)) return null;
  const orientation = Math.abs(width - height) / Math.max(width, height) < 0.04 ? "square" : width > height ? "landscape" : "portrait";
  return {
    width,
    height,
    ...(type === "video" ? { durationSeconds: Number(durationSeconds.toFixed(3)) } : {}),
    aspectRatio: Number((width / height).toFixed(4)),
    orientation,
    inspectedAt: new Date().toISOString(),
    validationVersion: 1,
  };
}

function mediaPayloadIsReady(payload: Record<string, unknown> | null | undefined): boolean {
  return payload?.uploadState === "ready" && (!payload.processingState || payload.processingState === "ready");
}

function mediaUsesMux(payload: Record<string, any> | null | undefined): boolean {
  return payload?.mediaProvider === "mux" && payload?.mux && typeof payload.mux === "object";
}

async function materializeMediaUrl(client: any, content: { asset_path?: string | null; payload?: Record<string, any> }, expiresInSeconds = 6 * 60 * 60): Promise<string | null> {
  if (mediaUsesMux(content.payload)) {
    const playbackId = cleanText(content.payload?.mux?.playbackId, 180);
    const renditionName = cleanText(content.payload?.mux?.renditionName, 180) || "highest.mp4";
    if (!playbackId || !mediaPayloadIsReady(content.payload)) return null;
    try { return muxSignedPlaybackUrl(playbackId, renditionName, expiresInSeconds); }
    catch (reason) { console.error("Mux playback URL failed", reason); return null; }
  }
  if (!content.asset_path) return null;
  const signed = await client.storage.from(PORTAL_MEDIA_BUCKET).createSignedUrl(content.asset_path, expiresInSeconds);
  return signed.data?.signedUrl ?? null;
}

async function storageObjectExists(client: any, path: string): Promise<boolean> {
  const parts = path.split("/");
  const filename = parts.pop() || "";
  const directory = parts.join("/");
  if (!filename || !directory) return false;
  const stored = await client.storage.from(PORTAL_MEDIA_BUCKET).list(directory, { limit: 10, search: filename });
  return !stored.error && Boolean(stored.data?.some((entry: { name: string }) => entry.name === filename));
}

function portalSetupUrl(request: Request): string {
  const configured = process.env.SITE_URL;
  if (configured) {
    try { return `${new URL(configured).origin}/portal?setup=1`; } catch { /* use request origin */ }
  }
  return `${new URL(request.url).origin}/portal?setup=1`;
}

function tenantSlug(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "kunde";
}

async function uniqueTenantSlug(client: any, companyName: string): Promise<string> {
  const base = tenantSlug(companyName);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix ? `${base}-${suffix + 1}` : base;
    const existing = await client.from("tenants").select("id").eq("slug", candidate).maybeSingle();
    if (!existing.data) return candidate;
  }
  return `${base}-${randomBytes(4).toString("hex")}`;
}

async function authUserByEmail(client: any, email: string): Promise<any | null> {
  for (let page = 1; page <= 10; page += 1) {
    const users = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (users.error) throw new Error("Portalbenutzer konnten nicht geprüft werden");
    const match = users.data.users.find((user: any) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (users.data.users.length < 100) return null;
  }
  return null;
}

async function createPortalInvitation(client: any, request: Request, email: string, displayName: string, tenantId: string): Promise<{ user: any; invitationUrl: string | null }> {
  let user = await authUserByEmail(client, email);
  if (user?.email_confirmed_at) return { user, invitationUrl: null };
  const type = user ? "magiclink" : "invite";
  const link = await client.auth.admin.generateLink({
    type,
    email,
    options: {
      redirectTo: portalSetupUrl(request),
      data: { full_name: displayName, tenant_id: tenantId, audience: "portal" },
    },
  });
  if (link.error || !link.data?.user || !link.data?.properties?.action_link) {
    throw new Error(link.error?.message || "Einladungslink konnte nicht erstellt werden");
  }
  user = link.data.user;
  return { user, invitationUrl: link.data.properties.action_link };
}

async function sendPortalInvitation(email: string, displayName: string, companyName: string, invitationUrl: string): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;
  const mail = await new Resend(resendKey).emails.send({
    from: "SwissCompact Portal <kontakt@swisscompact.com>",
    to: email,
    replyTo: "kontakt@swisscompact.com",
    subject: `Ihr SwissCompact Portal für ${companyName}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#18181b"><p style="color:#c8102e;font-weight:800;letter-spacing:.12em">SWISSCOMPACT</p><h1 style="font-size:30px">Ihr Kundenportal ist bereit.</h1><p>Guten Tag ${escapeHtml(displayName)},</p><p>SwissCompact hat den geschützten Portal-Arbeitsbereich für <strong>${escapeHtml(companyName)}</strong> vorbereitet.</p><p style="margin:30px 0"><a href="${escapeHtml(invitationUrl)}" style="display:inline-block;padding:15px 22px;background:#d70b31;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Zugang bestätigen und Passwort festlegen</a></p><p style="font-size:13px;color:#666">Dieser Link ist persönlich. Leiten Sie ihn bitte nicht weiter.</p><p>Freundliche Grüsse<br>Marcel Spahr und Thomas Peter<br>SwissCompact</p></div>`,
  });
  if (mail.error) throw new Error(`Einladungs-E-Mail konnte nicht gesendet werden: ${mail.error.message}`);
  return true;
}

async function sendCustomerStatusNotification(
  client: any,
  clientId: string | null | undefined,
  subject: string,
  heading: string,
  message: string,
): Promise<boolean> {
  if (!clientId || !process.env.RESEND_API_KEY) return false;
  const customer = await client.from("clients").select("company_name,contact_name,email").eq("id", clientId).maybeSingle();
  if (!customer.data?.email || !validEmail(customer.data.email)) return false;
  let portalUrl = "https://www.swisscompact.com/portal";
  if (process.env.SITE_URL) {
    try { portalUrl = `${new URL(process.env.SITE_URL).origin}/portal`; } catch { /* keep production URL */ }
  }
  try {
    const mail = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: "SwissCompact <kontakt@swisscompact.com>",
      to: customer.data.email,
      replyTo: "kontakt@swisscompact.com",
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#18181b"><p style="color:#c8102e;font-weight:800;letter-spacing:.12em">SWISSCOMPACT</p><h1 style="font-size:28px">${escapeHtml(heading)}</h1><p>Guten Tag ${escapeHtml(customer.data.contact_name || customer.data.company_name || "")},</p><p style="font-size:16px;line-height:1.65">${escapeHtml(message)}</p><p style="margin:30px 0"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:15px 22px;background:#d70b31;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Meine Vorgänge öffnen</a></p><p style="font-size:13px;color:#666">Im geschützten Kundenportal sehen Sie jederzeit den aktuellen Stand und die zugehörigen Dokumente.</p><p>Freundliche Grüsse<br>Marcel Spahr und Thomas Peter<br>SwissCompact</p></div>`,
    });
    if (mail.error) throw new Error(mail.error.message);
    return true;
  } catch (reason) {
    console.error("Customer status notification failed", reason);
    return false;
  }
}

async function sendInternalProjectNotification(subject: string, heading: string, message: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const mail = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: "SwissCompact Portal <kontakt@swisscompact.com>",
      to: "kontakt@swisscompact.com",
      replyTo: "kontakt@swisscompact.com",
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#18181b"><p style="color:#c8102e;font-weight:800;letter-spacing:.12em">SWISSCOMPACT PORTAL</p><h1>${escapeHtml(heading)}</h1><p style="line-height:1.65">${escapeHtml(message)}</p><p><a href="https://www.swisscompact.com/dashboard" style="color:#c8102e;font-weight:700">Projekt im Dashboard öffnen</a></p></div>`,
    });
    if (mail.error) throw new Error(mail.error.message);
  } catch (reason) {
    console.error("Internal project notification failed", reason);
  }
}

async function portalProject(admin: any, profile: { clientId: string; tenantId: string }, projectId: string): Promise<any | null> {
  const result = await admin.from("projects").select("id,client_id,tenant_id,title,order_number,status").eq("id", projectId).eq("client_id", profile.clientId).eq("tenant_id", profile.tenantId).maybeSingle();
  return result.data ?? null;
}

function safeFileName(value: unknown): string {
  return cleanText(value, 180).replace(/[^a-zA-Z0-9._ -]+/g, "-") || "Datei";
}

function relatedRecord(value: any): any {
  return Array.isArray(value) ? value[0] : value;
}

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

async function displayConfigurationBlueprint(client: any, displayId: string, forcedCampaignId?: string): Promise<Record<string, unknown>> {
  const display = await client.from("tenant_displays").select("id,tenant_id,fallback_content_id").eq("id", displayId).maybeSingle();
  if (!display.data) return { campaignIds: [], fallbackContentId: null };
  const targets = await client.from("tenant_campaign_displays").select("campaign_id").eq("display_id", displayId);
  let campaignIds = forcedCampaignId ? [forcedCampaignId] : (targets.data ?? []).map((entry: { campaign_id: string }) => entry.campaign_id);
  if (!forcedCampaignId && campaignIds.length) {
    const campaigns = await client.from("tenant_campaigns").select("id,status").in("id", campaignIds).in("status", ["active", "scheduled"]);
    campaignIds = (campaigns.data ?? []).map((campaign: { id: string }) => campaign.id);
  }
  const assignments = campaignIds.length
    ? await client.from("tenant_campaign_display_content").select("campaign_id,content_id,position,duration_seconds").eq("tenant_id", display.data.tenant_id).eq("display_id", displayId).in("campaign_id", campaignIds).order("position")
    : { data: [] };
  return {
    campaignIds,
    assignments: (assignments.data ?? []).map((entry: any) => ({ campaignId: entry.campaign_id, contentId: entry.content_id, position: entry.position, durationSeconds: entry.duration_seconds })),
    fallbackContentId: display.data.fallback_content_id ?? null,
  };
}

async function bumpDisplayConfigurations(client: any, displayIds: string[], source = "system", campaignId?: string): Promise<void> {
  const ids = [...new Set(displayIds.filter(Boolean))];
  if (!ids.length) return;
  await Promise.all(ids.map(async (displayId) => {
    const blueprint = await displayConfigurationBlueprint(client, displayId);
    const version = await client.rpc("create_display_configuration_version", {
      target_display: displayId,
      next_configuration: blueprint,
      version_source: source,
      source_campaign: campaignId || null,
      version_state: "active",
    });
    if (version.error) throw new Error(version.error.message);
  }));
}

async function contentUsage(client: any, tenantId: string, contentId: string): Promise<{ campaignIds: string[]; displayIds: string[] }> {
  const [legacyLinks, targetLinks, fallbackDisplays] = await Promise.all([
    client.from("tenant_campaign_content").select("campaign_id").eq("content_id", contentId),
    client.from("tenant_campaign_display_content").select("display_id").eq("content_id", contentId).eq("tenant_id", tenantId),
    client.from("tenant_displays").select("id").eq("tenant_id", tenantId).eq("fallback_content_id", contentId),
  ]);
  const campaignIds = [...new Set<string>((legacyLinks.data ?? []).map((link: { campaign_id: string }) => link.campaign_id))];
  const campaignTargets = campaignIds.length
    ? await client.from("tenant_campaign_displays").select("display_id").in("campaign_id", campaignIds)
    : { data: [] as Array<{ display_id: string }> };
  return {
    campaignIds,
    displayIds: [...new Set<string>([...(targetLinks.data ?? []).map((link: { display_id: string }) => link.display_id), ...(campaignTargets.data ?? []).map((link: { display_id: string }) => link.display_id), ...(fallbackDisplays.data ?? []).map((display: { id: string }) => display.id)])],
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

function schedulesOverlap(a: { starts_at?: string | null; ends_at?: string | null }, b: { starts_at?: string | null; ends_at?: string | null }): boolean {
  const aStart = a.starts_at ? new Date(a.starts_at).getTime() : Number.NEGATIVE_INFINITY;
  const aEnd = a.ends_at ? new Date(a.ends_at).getTime() : Number.POSITIVE_INFINITY;
  const bStart = b.starts_at ? new Date(b.starts_at).getTime() : Number.NEGATIVE_INFINITY;
  const bEnd = b.ends_at ? new Date(b.ends_at).getTime() : Number.POSITIVE_INFINITY;
  return aStart < bEnd && bStart < aEnd;
}

async function campaignConflicts(client: any, campaign: any): Promise<Array<{ campaignId: string; campaignName: string; displayId: string; displayName: string }>> {
  const targets = await client.from("tenant_campaign_displays").select("display_id,display:tenant_displays(name)").eq("campaign_id", campaign.id);
  const displayIds = (targets.data ?? []).map((entry: any) => entry.display_id);
  if (!displayIds.length) return [];
  const links = await client.from("tenant_campaign_displays").select("campaign_id,display_id,display:tenant_displays(name),campaign:tenant_campaigns(id,name,status,priority,starts_at,ends_at)").in("display_id", displayIds).neq("campaign_id", campaign.id);
  return (links.data ?? []).flatMap((link: any) => {
    const other = relatedRecord(link.campaign);
    const display = relatedRecord(link.display);
    if (!other || !["active", "scheduled"].includes(other.status) || Number(other.priority || 50) !== Number(campaign.priority || 50) || !schedulesOverlap(campaign, other)) return [];
    return [{ campaignId: other.id, campaignName: other.name, displayId: link.display_id, displayName: display?.name || "Bildschirm" }];
  });
}

async function deviceRecord(request: Request) {
  const token = deviceToken(request);
  if (token.length < 32) return null;
  const client = dashboardSupabase();
  if (!client) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const display = await client.from("tenant_displays").select("id,tenant_id,name,status,configuration_version,last_acknowledged_version,fallback_content_id,device_token_hash").eq("device_token_hash", tokenHash).maybeSingle();
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
    const heartbeatError = cleanText(body.lastError, 1000) || null;
    const result = await authorized.client.from("tenant_displays").update({ status: cleanText(body.health, 30) === "maintenance" ? "maintenance" : "online", last_seen_at: now, software_version: cleanText(body.softwareVersion, 80) || null, last_error: heartbeatError, delivery_status: heartbeatError ? "error" : Number(authorized.display.last_acknowledged_version || 0) === Number(authorized.display.configuration_version || 0) ? "delivered" : "pending", last_delivery_error: heartbeatError, updated_at: now }).eq("id", authorized.display.id);
    if (result.error) return json({ error: "Status konnte nicht aktualisiert werden" }, { status: 400 });
    return json({ ok: true, configurationVersion: authorized.display.configuration_version });
  }
  if (mode === "ack") {
    const acknowledgedVersion = Math.max(0, Math.round(Number(body.configurationVersion) || 0));
    if (!acknowledgedVersion || acknowledgedVersion > Number(authorized.display.configuration_version || 0)) return json({ error: "Ungültige Konfigurationsversion" }, { status: 409 });
    const deliveryError = cleanText(body.error, 1000) || null;
    const now = new Date().toISOString();
    const result = await authorized.client.from("tenant_displays").update({
      last_acknowledged_version: acknowledgedVersion,
      last_delivery_at: now,
      delivery_status: deliveryError ? "error" : "delivered",
      last_delivery_error: deliveryError,
      last_error: deliveryError,
      updated_at: now,
    }).eq("id", authorized.display.id);
    if (result.error) return json({ error: "Auslieferung konnte nicht bestätigt werden" }, { status: 400 });
    if (deliveryError) {
      await authorized.client.from("tenant_display_alerts").upsert({
        tenant_id: authorized.display.tenant_id,
        display_id: authorized.display.id,
        kind: "delivery_error",
        severity: "error",
        status: "open",
        message: deliveryError,
        last_seen_at: now,
        resolved_at: null,
      }, { onConflict: "display_id,kind" });
    } else {
      await authorized.client.from("tenant_display_alerts").update({ status: "resolved", resolved_at: now, last_seen_at: now }).eq("display_id", authorized.display.id).in("kind", ["delivery_error", "cache_error"]).neq("status", "resolved");
    }
    return json({ ok: true, configurationVersion: acknowledgedVersion });
  }
  return json({ error: "Unbekannte Geräteaktion" }, { status: 404 });
}

async function expireDisplayTest(client: any, display: any): Promise<void> {
  const activeTest = await client.from("tenant_display_test_publications").select("id,previous_version,expires_at").eq("display_id", display.id).eq("status", "active").maybeSingle();
  if (!activeTest.data || new Date(activeTest.data.expires_at).getTime() > Date.now()) return;
  const previous = activeTest.data.previous_version
    ? await client.from("tenant_display_config_versions").select("configuration").eq("display_id", display.id).eq("version", activeTest.data.previous_version).maybeSingle()
    : { data: null };
  const blueprint = previous.data?.configuration ?? await displayConfigurationBlueprint(client, display.id);
  await client.rpc("create_display_configuration_version", {
    target_display: display.id,
    next_configuration: blueprint,
    version_source: "rollback",
    source_campaign: null,
    version_state: "rolled_back",
  });
  await client.from("tenant_display_test_publications").update({ status: "expired", completed_at: new Date().toISOString() }).eq("id", activeTest.data.id);
}

async function buildDisplayConfig(client: any, display: any, updateDeviceState = true, forcedCampaignId = ""): Promise<Response> {
  if (updateDeviceState) {
    await expireDisplayTest(client, display);
    const refreshed = await client.from("tenant_displays").select("id,tenant_id,name,status,configuration_version,fallback_content_id").eq("id", display.id).maybeSingle();
    if (refreshed.data) display = refreshed.data;
  }
  const targets = await client.from("tenant_campaign_displays").select("campaign_id").eq("display_id", display.id);
  let campaignIds = forcedCampaignId ? [forcedCampaignId] : (targets.data ?? []).map((entry: { campaign_id: string }) => entry.campaign_id);
  let versionConfiguration: Record<string, any> | null = null;
  let deliveryMode: "live" | "preview" | "test" = forcedCampaignId ? "preview" : "live";
  if (!forcedCampaignId) {
    const currentVersion = await client.from("tenant_display_config_versions").select("configuration,source,state").eq("display_id", display.id).eq("version", display.configuration_version).maybeSingle();
    versionConfiguration = currentVersion.data?.configuration ?? null;
    const versionCampaignIds = currentVersion.data?.configuration?.campaignIds;
    if (Array.isArray(versionCampaignIds)) campaignIds = versionCampaignIds.filter((id: unknown): id is string => typeof id === "string");
    if (currentVersion.data?.source === "test" || currentVersion.data?.state === "test") deliveryMode = "test";
  }
  const emptyConfig = async () => {
    const fallback = await materializeFallback(client, display, versionConfiguration?.fallbackContentId);
    return json({ display: { id: display.id, name: display.name }, configurationVersion: display.configuration_version, campaigns: [], playlist: [], fallback, mode: deliveryMode, generatedAt: new Date().toISOString() });
  };
  if (!campaignIds.length) return emptyConfig();
  let campaignsQuery = client.from("tenant_campaigns").select("id,name,status,priority,starts_at,ends_at,updated_at,content_links:tenant_campaign_content(position,duration_seconds,content:tenant_content(id,title,content_type,status,payload,asset_path))").in("id", campaignIds);
  if (!forcedCampaignId) campaignsQuery = campaignsQuery.in("status", ["active", "scheduled"]);
  const campaigns = await campaignsQuery.order("priority", { ascending: false }).order("starts_at", { ascending: true, nullsFirst: true });
  if (campaigns.error) return json({ error: "Konfiguration konnte nicht geladen werden" }, { status: 503 });
  let targetContent: { data: any[] | null; error: any };
  if (!forcedCampaignId && Array.isArray(versionConfiguration?.assignments)) {
    const assignmentContentIds = [...new Set<string>(versionConfiguration.assignments.map((entry: any) => cleanText(entry.contentId, 80)).filter(Boolean))];
    const contentRecords = assignmentContentIds.length
      ? await client.from("tenant_content").select("id,title,content_type,status,payload,asset_path").eq("tenant_id", display.tenant_id).in("id", assignmentContentIds)
      : { data: [], error: null };
    const byId = new Map((contentRecords.data ?? []).map((entry: any) => [entry.id, entry]));
    targetContent = { error: contentRecords.error, data: versionConfiguration.assignments.map((entry: any) => ({ campaign_id: entry.campaignId, position: entry.position, duration_seconds: entry.durationSeconds, content: byId.get(entry.contentId) ?? null })) };
  } else {
    targetContent = await client.from("tenant_campaign_display_content")
      .select("campaign_id,position,duration_seconds,content:tenant_content(id,title,content_type,status,payload,asset_path)")
      .eq("tenant_id", display.tenant_id).eq("display_id", display.id).in("campaign_id", campaignIds).order("position");
  }
  if (targetContent.error) return json({ error: "Die zielbezogenen Kampagneninhalte konnten nicht geladen werden" }, { status: 503 });
  const targetContentByCampaign = new Map<string, typeof targetContent.data>();
  for (const link of targetContent.data ?? []) {
    const links = targetContentByCampaign.get(link.campaign_id) ?? [];
    links.push(link);
    targetContentByCampaign.set(link.campaign_id, links);
  }
  const now = Date.now();
  let activeCampaigns = (campaigns.data ?? []).filter((campaign: any) => forcedCampaignId || ((!campaign.starts_at || new Date(campaign.starts_at).getTime() <= now) && (!campaign.ends_at || new Date(campaign.ends_at).getTime() > now)));
  if (!forcedCampaignId && activeCampaigns.length) {
    const highestPriority = Math.max(...activeCampaigns.map((campaign: any) => Number(campaign.priority || 50)));
    activeCampaigns = activeCampaigns.filter((campaign: any) => Number(campaign.priority || 50) === highestPriority);
  }
  const playlist = [] as Array<Record<string, unknown>>;
  for (const campaign of activeCampaigns) {
    if (updateDeviceState && campaign.status === "scheduled") await client.from("tenant_campaigns").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", campaign.id);
    const targetedLinks = targetContentByCampaign.get(campaign.id) ?? [];
    const links = [...(targetedLinks.length ? targetedLinks : campaign.content_links || [])].sort((a, b) => a.position - b.position);
    for (const link of links) {
      const linkedContent = Array.isArray(link.content) ? link.content[0] : link.content;
      const content = linkedContent as { id: string; title: string; content_type: string; status: string; payload: Record<string, unknown>; asset_path?: string | null } | null;
      if (!content || !["approved", "published"].includes(content.status)) continue;
      if (["image", "video"].includes(content.content_type) && (!content.asset_path || !mediaPayloadIsReady(content.payload))) continue;
      const mediaUrl = await materializeMediaUrl(client, content);
      playlist.push({ campaignId: campaign.id, campaignName: campaign.name, contentId: content.id, title: content.title, contentType: content.content_type, payload: content.payload, mediaUrl, durationSeconds: Math.min(3600, Math.max(5, Number(link.duration_seconds) || 10)) });
    }
  }
  if (updateDeviceState) await client.from("tenant_displays").update({ last_config_at: new Date().toISOString() }).eq("id", display.id);
  const fallback = await materializeFallback(client, display, versionConfiguration?.fallbackContentId);
  return json({ display: { id: display.id, name: display.name }, configurationVersion: display.configuration_version, campaigns: activeCampaigns.map((campaign: any) => ({ id: campaign.id, name: campaign.name, status: campaign.status, priority: campaign.priority, starts_at: campaign.starts_at, ends_at: campaign.ends_at, updated_at: campaign.updated_at })), playlist, fallback, mode: deliveryMode, generatedAt: new Date().toISOString() });
}

async function materializeFallback(client: any, display: any, configuredFallbackId?: string | null): Promise<Record<string, unknown> | null> {
  const fallbackId = configuredFallbackId === undefined ? display.fallback_content_id : configuredFallbackId;
  if (!fallbackId) return null;
  const fallback = await client.from("tenant_content").select("id,title,content_type,status,payload,asset_path").eq("id", fallbackId).eq("tenant_id", display.tenant_id).in("status", ["approved", "published"]).maybeSingle();
  if (!fallback.data) return null;
  if (["image", "video"].includes(fallback.data.content_type) && (!fallback.data.asset_path || !mediaPayloadIsReady(fallback.data.payload))) return null;
  const mediaUrl = await materializeMediaUrl(client, fallback.data);
  return { contentId: fallback.data.id, title: fallback.data.title, contentType: fallback.data.content_type, payload: fallback.data.payload, mediaUrl, durationSeconds: 3600 };
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
    .select("id,tenant_id,name,status,configuration_version,fallback_content_id")
    .eq("id", displayId).eq("tenant_id", authorized.profile.tenantId).maybeSingle();
  if (display.error || !display.data) return json({ error: "Bildschirm nicht gefunden" }, { status: 404 });
  const campaignId = cleanText(new URL(request.url).searchParams.get("campaign"), 80);
  if (campaignId) {
    const campaign = await authorized.client.from("tenant_campaigns").select("id").eq("id", campaignId).eq("tenant_id", authorized.profile.tenantId).maybeSingle();
    if (!campaign.data) return json({ error: "Kampagne nicht gefunden" }, { status: 404 });
  }
  return buildDisplayConfig(authorized.client, display.data, false, campaignId);
}

async function handlePortalRecords(request: Request): Promise<Response> {
  const authorized = await authorizePortal(request);
  if (isResponse(authorized)) return authorized;
  const { client, profile } = authorized;
  if (profile.role === "viewer") return json({ error: "Nur Lesezugriff" }, { status: 403 });
  const body = await request.json() as Payload;
  const action = cleanText(body.action, 80);
  const now = new Date().toISOString();

  if (action.includes("partner")) {
    const admin = dashboardSupabase();
    if (!admin) return json({ error: "Das Partnerprogramm ist noch nicht konfiguriert" }, { status: 503 });
    const partnerResponse = await handlePartnerNetworkAction(admin, profile, body);
    if (partnerResponse) return partnerResponse;
  }

  if (action === "create_portal_quote_access") {
    if (!["owner", "admin"].includes(profile.role)) return json({ error: "Nur Inhaber oder Administratoren dürfen Offerten entscheiden" }, { status: 403 });
    const quoteId = cleanText(body.quoteId, 80);
    const admin = dashboardSupabase();
    if (!quoteId || !admin) return json({ error: "Offerte oder Portalverwaltung fehlt" }, { status: 400 });
    const quote = await admin.from("quotes").select("id,quote_number,status,valid_until").eq("id", quoteId).eq("client_id", profile.clientId).maybeSingle();
    if (!quote.data) return json({ error: "Offerte nicht gefunden" }, { status: 404 });
    if (!["sent", "viewed"].includes(quote.data.status)) return json({ error: "Diese Offerte ist bereits abgeschlossen" }, { status: 409 });
    const validityEnd = quote.data.valid_until ? new Date(`${quote.data.valid_until}T23:59:59.999+02:00`) : new Date(Date.now() + 7 * 24 * 60 * 60_000);
    const maximum = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    const expiresAt = new Date(Math.min(validityEnd.getTime(), maximum.getTime()));
    if (expiresAt.getTime() <= Date.now()) return json({ error: "Diese Offerte ist abgelaufen" }, { status: 409 });
    const token = randomBytes(32).toString("base64url");
    const access = await admin.from("quote_access_tokens").insert({ quote_id: quoteId, token_hash: createHash("sha256").update(token).digest("hex"), recipient_email: profile.email.toLowerCase(), expires_at: expiresAt.toISOString(), created_by: profile.userId }).select("id").single();
    if (access.error) return json({ error: "Offerte konnte nicht sicher geöffnet werden" }, { status: 503 });
    await admin.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "quote_opened_from_portal", entity_type: "quote", entity_id: quoteId, metadata: { quoteNumber: quote.data.quote_number, accessId: access.data.id } });
    return json({ ok: true, url: `${new URL(request.url).origin}/offerte/${token}`, expiresAt: expiresAt.toISOString() });
  }

  if (action === "post_project_message") {
    const admin = dashboardSupabase();
    const projectId = cleanText(body.projectId, 80);
    const message = cleanText(body.message, 5000);
    if (!admin || !projectId || !message) return json({ error: "Auftrag oder Nachricht fehlt" }, { status: 400 });
    const project = await portalProject(admin, profile, projectId);
    if (!project) return json({ error: "Auftrag nicht gefunden" }, { status: 404 });
    const created = await admin.from("project_messages").insert({ project_id: projectId, client_id: profile.clientId, tenant_id: profile.tenantId, author_user_id: profile.userId, author_type: "customer", author_name: profile.displayName, body: message, visible_to_customer: true }).select("id,project_id,author_type,author_name,body,created_at").single();
    if (created.error) return json({ error: "Nachricht konnte nicht gespeichert werden" }, { status: 400 });
    await admin.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "project_message_created", entity_type: "project", entity_id: projectId, metadata: { messageId: created.data.id } });
    await sendInternalProjectNotification(`Neue Kundennachricht · ${project.order_number}`, "Neue Nachricht im Kundenauftrag", `${profile.displayName} hat beim Auftrag „${project.title}“ eine Nachricht hinterlassen: ${message}`);
    return json({ ok: true, record: created.data });
  }

  if (action === "prepare_project_reference_upload") {
    const admin = dashboardSupabase();
    const projectId = cleanText(body.projectId, 80);
    const title = cleanText(body.title, 180);
    const fileName = safeFileName(body.fileName);
    const mimeType = cleanText(body.mimeType, 100).toLowerCase();
    const sizeBytes = Math.max(0, Math.floor(Number(body.sizeBytes) || 0));
    const fileConfig = PROJECT_FILE_TYPES[mimeType];
    if (!admin || !projectId || !title || !fileConfig || sizeBytes < 1 || sizeBytes > fileConfig.maxBytes) return json({ error: "Datei, Titel oder Dateigrösse wird nicht unterstützt" }, { status: 400 });
    const project = await portalProject(admin, profile, projectId);
    if (!project) return json({ error: "Auftrag nicht gefunden" }, { status: 404 });
    const deliverable = await admin.from("project_deliverables").insert({ project_id: projectId, client_id: profile.clientId, tenant_id: profile.tenantId, title, kind: "reference", status: "received", current_version: 0, created_by: profile.userId }).select("id").single();
    if (deliverable.error) return json({ error: "Dateieintrag konnte nicht erstellt werden" }, { status: 400 });
    const storagePath = `${profile.tenantId}/projects/${projectId}/${deliverable.data.id}/v1-${randomBytes(12).toString("hex")}.${fileConfig.extension}`;
    const signed = await admin.storage.from(PORTAL_MEDIA_BUCKET).createSignedUploadUrl(storagePath);
    if (signed.error || !signed.data?.token) return json({ error: "Upload konnte nicht vorbereitet werden" }, { status: 503 });
    const version = await admin.from("project_deliverable_versions").insert({ deliverable_id: deliverable.data.id, project_id: projectId, client_id: profile.clientId, tenant_id: profile.tenantId, version: 1, storage_path: storagePath, file_name: fileName, mime_type: mimeType, size_bytes: sizeBytes, notes: cleanText(body.notes, 1500) || null, upload_state: "uploading", submitted_by: profile.userId, submitted_by_type: "customer" }).select("id").single();
    if (version.error) return json({ error: "Dateiversion konnte nicht vorbereitet werden" }, { status: 400 });
    return json({ ok: true, deliverableId: deliverable.data.id, versionId: version.data.id, upload: { signedUrl: signed.data.signedUrl, path: signed.data.path } });
  }

  if (action === "finalize_project_reference_upload") {
    const admin = dashboardSupabase();
    const versionId = cleanText(body.versionId, 80);
    if (!admin || !versionId) return json({ error: "Dateiversion fehlt" }, { status: 400 });
    const version = await admin.from("project_deliverable_versions").select("id,deliverable_id,project_id,storage_path,file_name,upload_state").eq("id", versionId).eq("client_id", profile.clientId).eq("tenant_id", profile.tenantId).eq("submitted_by", profile.userId).maybeSingle();
    if (!version.data) return json({ error: "Dateiversion nicht gefunden" }, { status: 404 });
    const project = await portalProject(admin, profile, version.data.project_id);
    if (!project) return json({ error: "Auftrag nicht gefunden" }, { status: 404 });
    const parts = version.data.storage_path.split("/"); const file = parts.pop() || ""; const directory = parts.join("/");
    const stored = await admin.storage.from(PORTAL_MEDIA_BUCKET).list(directory, { limit: 10, search: file });
    if (stored.error || !stored.data?.some((entry: any) => entry.name === file)) return json({ error: "Datei wurde noch nicht vollständig übertragen" }, { status: 409 });
    const finalized = await Promise.all([
      admin.from("project_deliverable_versions").update({ upload_state: "ready" }).eq("id", versionId).eq("upload_state", "uploading"),
      admin.from("project_deliverables").update({ current_version: 1, status: "received", updated_at: now }).eq("id", version.data.deliverable_id),
      admin.from("project_messages").insert({ project_id: project.id, client_id: profile.clientId, tenant_id: profile.tenantId, author_type: "system", author_name: "SwissCompact Portal", body: `${profile.displayName} hat die Datei „${version.data.file_name}“ hochgeladen.`, visible_to_customer: true }),
    ]);
    if (finalized.some((result) => result.error)) return json({ error: "Die Datei wurde übertragen, konnte aber noch nicht abgeschlossen werden. Bitte erneut versuchen." }, { status: 409 });
    await admin.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "project_reference_uploaded", entity_type: "project", entity_id: project.id, metadata: { versionId, fileName: version.data.file_name } });
    await sendInternalProjectNotification(`Neue Datei · ${project.order_number}`, "Kundendatei hochgeladen", `${profile.displayName} hat beim Auftrag „${project.title}“ die Datei „${version.data.file_name}“ bereitgestellt.`);
    return json({ ok: true });
  }

  if (action === "review_project_deliverable") {
    if (!["owner", "admin"].includes(profile.role)) return json({ error: "Nur Inhaber oder Administratoren dürfen Entwürfe freigeben" }, { status: 403 });
    const admin = dashboardSupabase();
    const versionId = cleanText(body.versionId, 80);
    const decision = body.decision === "approved" ? "approved" : body.decision === "changes_requested" ? "changes_requested" : "";
    const feedback = cleanText(body.feedback, 3000);
    if (!admin || !versionId || !decision || (decision === "changes_requested" && !feedback)) return json({ error: "Entscheidung oder Änderungswunsch fehlt" }, { status: 400 });
    const version = await admin.from("project_deliverable_versions").select("id,deliverable_id,project_id,version,file_name,upload_state").eq("id", versionId).eq("client_id", profile.clientId).eq("tenant_id", profile.tenantId).eq("upload_state", "ready").maybeSingle();
    if (!version.data) return json({ error: "Entwurf nicht gefunden" }, { status: 404 });
    const project = await portalProject(admin, profile, version.data.project_id);
    const deliverable = await admin.from("project_deliverables").select("id,title,status,current_version").eq("id", version.data.deliverable_id).eq("client_id", profile.clientId).eq("tenant_id", profile.tenantId).maybeSingle();
    if (!project || !deliverable.data || deliverable.data.current_version !== version.data.version || deliverable.data.status !== "customer_review") return json({ error: "Dieser Entwurf ist nicht mehr zur Entscheidung offen" }, { status: 409 });
    const review = await admin.from("project_review_decisions").insert({ deliverable_version_id: versionId, project_id: project.id, client_id: profile.clientId, tenant_id: profile.tenantId, decision, feedback: feedback || null, decided_by: profile.userId, decided_by_name: profile.displayName, decided_by_email: profile.email }).select("id").single();
    if (review.error) return json({ error: "Diese Version wurde bereits entschieden" }, { status: 409 });
    let revisionId: string | null = null;
    if (decision === "changes_requested") {
      const rounds = await admin.from("project_revision_rounds").select("round_number").eq("deliverable_id", deliverable.data.id).order("round_number", { ascending: false }).limit(1);
      const roundNumber = Number(rounds.data?.[0]?.round_number || 0) + 1;
      const revision = await admin.from("project_revision_rounds").insert({ project_id: project.id, deliverable_id: deliverable.data.id, client_id: profile.clientId, tenant_id: profile.tenantId, round_number: roundNumber, status: "requested", request_text: feedback, requested_by: profile.userId }).select("id").single();
      if (revision.error) {
        await admin.from("project_review_decisions").delete().eq("id", review.data.id);
        return json({ error: "Der Änderungswunsch konnte nicht vollständig gespeichert werden" }, { status: 409 });
      }
      revisionId = revision.data.id;
    }
    const statusUpdate = await admin.from("project_deliverables").update({ status: decision, updated_at: now }).eq("id", deliverable.data.id).eq("current_version", version.data.version).eq("status", "customer_review").select("id").maybeSingle();
    if (!statusUpdate.data) {
      if (revisionId) await admin.from("project_revision_rounds").delete().eq("id", revisionId);
      await admin.from("project_review_decisions").delete().eq("id", review.data.id);
      return json({ error: "Der Entwurf wurde gleichzeitig geändert. Bitte laden Sie die Seite neu." }, { status: 409 });
    }
    await admin.from("project_messages").insert({ project_id: project.id, client_id: profile.clientId, tenant_id: profile.tenantId, author_user_id: profile.userId, author_type: "customer", author_name: profile.displayName, body: decision === "approved" ? `Version ${version.data.version} von „${deliverable.data.title}“ wurde freigegeben.` : `Änderungen für Version ${version.data.version} von „${deliverable.data.title}“ wurden angefordert: ${feedback}`, visible_to_customer: true });
    await admin.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: decision === "approved" ? "project_version_approved" : "project_changes_requested", entity_type: "project", entity_id: project.id, metadata: { deliverableId: deliverable.data.id, versionId, version: version.data.version, reviewId: review.data.id } });
    await sendInternalProjectNotification(`Kundenentscheid · ${project.order_number}`, decision === "approved" ? "Entwurf freigegeben" : "Änderungswunsch eingegangen", `${profile.displayName} hat „${deliverable.data.title}“ ${decision === "approved" ? "freigegeben" : `mit folgender Rückmeldung zurückgegeben: ${feedback}`}.`);
    return json({ ok: true, decision });
  }

  if (action === "decide_project_revision_cost") {
    if (!["owner", "admin"].includes(profile.role)) return json({ error: "Nur Inhaber oder Administratoren dürfen Zusatzkosten bestätigen" }, { status: 403 });
    const admin = dashboardSupabase();
    const revisionId = cleanText(body.revisionId, 80);
    const decision = body.decision === "approved" ? "approved" : body.decision === "declined" ? "declined" : "";
    if (!admin || !revisionId || !decision) return json({ error: "Entscheidung fehlt" }, { status: 400 });
    const revision = await admin.from("project_revision_rounds").select("id,project_id,deliverable_id,round_number,additional_cost_chf,status").eq("id", revisionId).eq("client_id", profile.clientId).eq("tenant_id", profile.tenantId).eq("status", "customer_approval").maybeSingle();
    if (!revision.data) return json({ error: "Kostenfreigabe ist nicht mehr offen" }, { status: 409 });
    const project = await portalProject(admin, profile, revision.data.project_id);
    if (!project) return json({ error: "Auftrag nicht gefunden" }, { status: 404 });
    const updated = await admin.from("project_revision_rounds").update({ status: decision, approved_by: profile.userId, approved_at: now, updated_at: now }).eq("id", revisionId).eq("status", "customer_approval").select("id").maybeSingle();
    if (!updated.data) return json({ error: "Kostenfreigabe wurde gleichzeitig verarbeitet" }, { status: 409 });
    const cost = new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(Number(revision.data.additional_cost_chf || 0));
    await admin.from("project_messages").insert({ project_id: project.id, client_id: profile.clientId, tenant_id: profile.tenantId, author_user_id: profile.userId, author_type: "customer", author_name: profile.displayName, body: `Zusatzkosten für Korrekturrunde ${revision.data.round_number} (${cost}) wurden ${decision === "approved" ? "bestätigt" : "abgelehnt"}.`, visible_to_customer: true });
    await admin.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: decision === "approved" ? "project_revision_cost_approved" : "project_revision_cost_declined", entity_type: "project", entity_id: project.id, metadata: { revisionId, roundNumber: revision.data.round_number, additionalCostChf: revision.data.additional_cost_chf } });
    await sendInternalProjectNotification(`Kostenentscheid · ${project.order_number}`, `Korrekturrunde ${revision.data.round_number} ${decision === "approved" ? "bestätigt" : "abgelehnt"}`, `${profile.displayName} hat die Zusatzkosten von ${cost} beim Auftrag „${project.title}“ ${decision === "approved" ? "bestätigt" : "abgelehnt"}.`);
    return json({ ok: true, decision });
  }

  if (action === "prepare_media_upload") {
    const title = cleanText(body.title, 180);
    const mimeType = cleanText(body.mimeType, 80).toLowerCase();
    const sizeBytes = Math.max(0, Math.floor(Number(body.sizeBytes) || 0));
    const media = PORTAL_MEDIA_TYPES[mimeType];
    const useMux = media?.type === "video" && muxVideoEnabled();
    const maxBytes = useMux ? MUX_VIDEO_MAX_BYTES : media?.maxBytes || 0;
    if (!title) return json({ error: "Titel fehlt" }, { status: 400 });
    if (!media || sizeBytes < 1 || sizeBytes > maxBytes) {
      return json({ error: "Dateityp oder Dateigrösse wird nicht unterstützt" }, { status: 400 });
    }
    if (media.type === "video" && !useMux && !["video/mp4", "video/webm"].includes(mimeType)) {
      return json({ error: "MOV- und MKV-Videos benötigen die aktivierte automatische Videoaufbereitung" }, { status: 503 });
    }
    const mediaMetadata = normalizedMediaMetadata(body.mediaMetadata, media.type);
    if (!mediaMetadata) return json({ error: "Die Datei wurde noch nicht technisch geprüft. Bitte laden Sie die Seite neu und wählen Sie die Datei erneut aus." }, { status: 400 });
    if (media.type === "video" && body.createPoster !== true) return json({ error: "Für das Video fehlt das automatisch erzeugte Vorschaubild" }, { status: 400 });
    const month = now.slice(0, 7);
    const assetKey = randomBytes(16).toString("hex");
    const assetPath = useMux ? null : `${profile.tenantId}/${month}/${assetKey}.${media.extension}`;
    const posterPath = media.type === "video" ? `${profile.tenantId}/${month}/${assetKey}-poster.jpg` : null;
    const signed = assetPath ? await client.storage.from(PORTAL_MEDIA_BUCKET).createSignedUploadUrl(assetPath) : null;
    if (assetPath && (signed?.error || !signed?.data?.token)) return json({ error: `Upload konnte nicht vorbereitet werden${signed?.error?.message ? `: ${signed.error.message}` : ""}` }, { status: 503 });
    const posterSigned = posterPath ? await client.storage.from(PORTAL_MEDIA_BUCKET).createSignedUploadUrl(posterPath) : null;
    if (posterPath && (posterSigned?.error || !posterSigned?.data?.token)) return json({ error: "Die Videovorschau konnte nicht vorbereitet werden" }, { status: 503 });
    const result = await client.from("tenant_content").insert({
      tenant_id: profile.tenantId,
      title,
      content_type: media.type,
      status: "draft",
      asset_path: assetPath,
      payload: { mimeType, sizeBytes, uploadState: "uploading", processingState: useMux ? "awaiting_upload" : "validated", compatibilityStatus: useMux ? "normalization_pending" : "browser_verified", mediaProvider: useMux ? "mux" : "supabase", mediaMetadata, posterPath, ...(useMux ? { mux: {} } : {}) },
      created_by: profile.userId,
      updated_by: profile.userId,
    }).select("id,title,content_type,status,payload,asset_path,created_at,updated_at").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    if (useMux) {
      try {
        const muxUpload = await createMuxDirectUpload(new URL(request.url).origin, result.data.id, title);
        const payload = { ...result.data.payload, mux: { uploadId: muxUpload.id, playbackPolicy: "signed" } };
        const linked = await client.from("tenant_content").update({ asset_path: `mux://${muxUpload.id}`, payload, updated_at: now }).eq("id", result.data.id).eq("tenant_id", profile.tenantId).select("id,title,content_type,status,payload,asset_path,created_at,updated_at").single();
        if (linked.error) {
          await deleteMuxDirectUpload(muxUpload.id).catch(() => undefined);
          await client.from("tenant_content").delete().eq("id", result.data.id);
          return json({ error: "Der sichere Videoupload konnte nicht verknüpft werden" }, { status: 503 });
        }
        await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "mux_upload_prepared", entity_type: "content", entity_id: result.data.id, metadata: { mimeType, sizeBytes, uploadId: muxUpload.id } });
        return json({
          ok: true,
          provider: "mux",
          record: linked.data,
          upload: { provider: "mux", url: muxUpload.url },
          posterUpload: posterSigned?.data ? { signedUrl: posterSigned.data.signedUrl, token: posterSigned.data.token, path: posterSigned.data.path } : null,
        });
      } catch (reason) {
        await client.from("tenant_content").delete().eq("id", result.data.id);
        console.error("Mux upload preparation failed", reason);
        return json({ error: "Die automatische Videoaufbereitung ist vorübergehend nicht erreichbar" }, { status: 503 });
      }
    }
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "upload_prepared", entity_type: "content", entity_id: result.data.id, metadata: { mimeType, sizeBytes } });
    return json({
      ok: true,
      provider: "supabase",
      record: result.data,
      upload: {
        provider: "supabase",
        signedUrl: signed!.data!.signedUrl,
        token: signed!.data!.token,
        path: signed!.data!.path,
        resumableUrl: resumableStorageUrl(signed!.data!.signedUrl),
      },
      posterUpload: posterSigned?.data ? { signedUrl: posterSigned.data.signedUrl, token: posterSigned.data.token, path: posterSigned.data.path } : null,
    });
  }

  if (action === "finalize_media_upload") {
    const id = cleanText(body.id, 80);
    if (!id) return json({ error: "Inhalt fehlt" }, { status: 400 });
    const existing = await client.from("tenant_content").select("id,asset_path,payload").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (existing.error || !existing.data?.asset_path) return json({ error: "Inhalt nicht gefunden" }, { status: 404 });
    const posterPath = typeof existing.data.payload?.posterPath === "string" ? existing.data.payload.posterPath : "";
    if (posterPath && !await storageObjectExists(client, posterPath)) return json({ error: "Die Videovorschau wurde noch nicht vollständig übertragen" }, { status: 409 });
    if (mediaUsesMux(existing.data.payload)) {
      const uploadId = cleanText(existing.data.payload?.mux?.uploadId, 180);
      if (!uploadId) return json({ error: "Die Videoaufbereitung ist nicht vollständig verknüpft" }, { status: 409 });
      try {
        const upload = await getMuxDirectUpload(uploadId);
        if (["errored", "cancelled", "timed_out"].includes(upload.status || "")) return json({ error: "Der Videoupload ist fehlgeschlagen. Bitte versuchen Sie es erneut." }, { status: 409 });
      } catch (reason) {
        console.error("Mux upload verification failed", reason);
        return json({ error: "Der Videoupload konnte noch nicht bestätigt werden" }, { status: 503 });
      }
      const result = await client.from("tenant_content").update({
        payload: {
          ...(existing.data.payload || {}),
          uploadState: "ready",
          processingState: existing.data.payload?.processingState === "ready" ? "ready" : "processing",
          compatibilityStatus: existing.data.payload?.processingState === "ready" ? "display_ready" : "normalizing",
          uploadedAt: now,
        },
        updated_by: profile.userId,
        updated_at: now,
      }).eq("id", id).eq("tenant_id", profile.tenantId).select("id,title,content_type,status,payload,asset_path,created_at,updated_at").single();
      if (result.error) return json({ error: result.error.message }, { status: 400 });
      await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "mux_upload_completed", entity_type: "content", entity_id: result.data.id, metadata: { uploadId } });
      return json({ ok: true, processing: true, record: result.data });
    }
    if (!await storageObjectExists(client, existing.data.asset_path)) return json({ error: "Die Datei wurde noch nicht vollständig übertragen" }, { status: 409 });
    const result = await client.from("tenant_content").update({
      payload: { ...(existing.data.payload || {}), uploadState: "ready", processingState: "ready", compatibilityStatus: "display_ready", processedAt: now },
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
    if (mediaUsesMux(existing.data.payload)) {
      const uploadId = cleanText(existing.data.payload?.mux?.uploadId, 180);
      if (uploadId) await deleteMuxDirectUpload(uploadId).catch((reason) => console.error("Mux upload cancellation failed", reason));
    }
    const uploadPaths = [mediaUsesMux(existing.data.payload) ? "" : existing.data.asset_path, typeof existing.data.payload?.posterPath === "string" ? existing.data.payload.posterPath : ""].filter(Boolean);
    if (uploadPaths.length) await client.storage.from(PORTAL_MEDIA_BUCKET).remove(uploadPaths);
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

  if (action === "create_service_request") {
    const requestType = cleanText(body.requestType, 40);
    const title = cleanText(body.title, 180);
    const objective = cleanText(body.objective, 5000);
    const deliverables = cleanText(body.deliverables, 5000);
    const desiredDate = cleanText(body.desiredDate, 20);
    const budget = cleanText(body.budget, 80);
    const requestTypes: Record<string, string> = {
      complex_campaign: "Komplexe Kampagne",
      video_production: "Videoproduktion",
      motion_design: "Animation & Motion Design",
      custom_content: "Individuelle Bilder & Inhalte",
      concept_strategy: "Konzept & Inhaltsstrategie",
      other: "Andere Produktion",
    };
    if (!requestTypes[requestType] || !title || !objective) return json({ error: "Art, Projekttitel und Ziel der Anfrage sind erforderlich" }, { status: 400 });
    if (desiredDate && !/^\d{4}-\d{2}-\d{2}$/.test(desiredDate)) return json({ error: "Der Wunschtermin ist ungültig" }, { status: 400 });
    const payload = {
      serviceRequest: true,
      serviceRequestStatus: "submitted",
      requestType,
      requestTypeLabel: requestTypes[requestType],
      objective,
      deliverables,
      desiredDate: desiredDate || null,
      budget: budget || null,
      requesterEmail: profile.email,
      requesterName: profile.displayName,
    };
    const creation = await client.rpc("create_portal_service_request", {
      target_tenant: profile.tenantId,
      request_title: title,
      request_payload: payload,
    });
    const linkage = Array.isArray(creation.data) ? creation.data[0] : creation.data;
    if (creation.error || !linkage?.request_id || !linkage?.opportunity_id) {
      console.error("service request CRM creation:", creation.error?.message || "missing linkage");
      return json({ error: "Produktionsanfrage und Verkaufschance konnten nicht gespeichert werden" }, { status: 400 });
    }
    const result = await client.from("tenant_content")
      .select("id,title,content_type,status,payload,created_at,updated_at")
      .eq("id", linkage.request_id)
      .eq("tenant_id", profile.tenantId)
      .single();
    if (result.error) return json({ error: "Produktionsanfrage wurde angelegt, konnte aber nicht geladen werden" }, { status: 500 });

    let notificationSent = false;
    if (process.env.RESEND_API_KEY) {
      const objectiveHtml = escapeHtml(objective).replace(/\n/g, "<br>");
      const deliverablesHtml = deliverables ? escapeHtml(deliverables).replace(/\n/g, "<br>") : "Noch offen";
      try {
        const mail = await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: "SwissCompact Portal <kontakt@swisscompact.com>",
          to: "kontakt@swisscompact.com",
          replyTo: profile.email,
          subject: `Neue Produktionsanfrage: ${title}`,
          html: `<h2>Neue Produktionsanfrage aus dem Kundenportal</h2><p><strong>Kunde:</strong> ${escapeHtml(profile.tenantName)}<br><strong>Kontakt:</strong> ${escapeHtml(profile.displayName)} (${escapeHtml(profile.email)})<br><strong>Art:</strong> ${escapeHtml(requestTypes[requestType])}<br><strong>Wunschtermin:</strong> ${escapeHtml(desiredDate || "Noch offen")}<br><strong>Budgetrahmen:</strong> ${escapeHtml(budget || "Noch offen")}</p><h3>${escapeHtml(title)}</h3><p>${objectiveHtml}</p><h3>Gewünschter Umfang</h3><p>${deliverablesHtml}</p>`,
        });
        notificationSent = !mail.error;
        if (mail.error) console.error("service request notification:", mail.error.message);
      } catch (reason) {
        console.error("service request notification:", reason);
      }
    }
    return json({ ok: true, record: result.data, opportunityId: linkage.opportunity_id, notificationSent });
  }

  if (action === "update_content_status") {
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 30);
    if (!id || !["draft", "review", "approved", "published", "archived"].includes(status)) {
      return json({ error: "Ungültige Statusänderung" }, { status: 400 });
    }
    if (["approved", "published"].includes(status)) {
      const existing = await client.from("tenant_content").select("content_type,asset_path,payload").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
      if (!existing.data) return json({ error: "Inhalt nicht gefunden" }, { status: 404 });
      if (["image", "video"].includes(existing.data.content_type) && (!existing.data.asset_path || !mediaPayloadIsReady(existing.data.payload))) {
        return json({ error: "Dieses Medium ist noch nicht vollständig geprüft und kann nicht freigegeben werden" }, { status: 409 });
      }
    }
    const result = await client.from("tenant_content").update({ status, updated_by: profile.userId, updated_at: now })
      .eq("id", id).eq("tenant_id", profile.tenantId)
      .select("id,title,content_type,status,payload,asset_path,created_at,updated_at").single();
    if (result.error) return json({ error: "Inhalt nicht gefunden oder Zugriff verweigert" }, { status: 404 });
    const usage = await contentUsage(client, profile.tenantId, id);
    if (!["approved", "published"].includes(status)) await client.from("tenant_displays").update({ fallback_content_id: null, updated_at: now }).eq("tenant_id", profile.tenantId).eq("fallback_content_id", id);
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

  if (action === "archive_content") {
    const id = cleanText(body.id, 80);
    if (!id) return json({ error: "Inhalt fehlt" }, { status: 400 });
    const existing = await client.from("tenant_content").select("id,title,status,payload").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (existing.error || !existing.data) return json({ error: "Inhalt nicht gefunden" }, { status: 404 });
    if (existing.data.status === "archived") return json({ ok: true, record: existing.data });
    const usage = await contentUsage(client, profile.tenantId, id);
    const payload = { ...(existing.data.payload || {}), archivePreviousStatus: existing.data.status };
    const archived = await client.from("tenant_content").update({ status: "archived", payload, updated_by: profile.userId, updated_at: now })
      .eq("id", id).eq("tenant_id", profile.tenantId)
      .select("id,title,content_type,status,payload,asset_path,created_at,updated_at").single();
    if (archived.error) return json({ error: "Inhalt konnte nicht archiviert werden" }, { status: 400 });
    const [legacyLinks, targetLinks] = await Promise.all([
      client.from("tenant_campaign_content").delete().eq("content_id", id),
      client.from("tenant_campaign_display_content").delete().eq("content_id", id).eq("tenant_id", profile.tenantId),
    ]);
    if (legacyLinks.error || targetLinks.error) console.error("content archive link cleanup:", legacyLinks.error?.message || targetLinks.error?.message);
    await client.from("tenant_displays").update({ fallback_content_id: null, updated_at: now }).eq("tenant_id", profile.tenantId).eq("fallback_content_id", id);
    await bumpDisplayConfigurations(client, usage.displayIds);
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "archive", entity_type: "content", entity_id: id, metadata: { title: existing.data.title, removedFromCampaigns: usage.campaignIds.length } });
    return json({ ok: true, record: archived.data });
  }

  if (action === "restore_content") {
    const id = cleanText(body.id, 80);
    if (!id) return json({ error: "Inhalt fehlt" }, { status: 400 });
    const existing = await client.from("tenant_content").select("id,title,status,payload").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (existing.error || !existing.data) return json({ error: "Archivierter Inhalt nicht gefunden" }, { status: 404 });
    if (existing.data.status !== "archived") return json({ error: "Der Inhalt befindet sich nicht im Archiv" }, { status: 409 });
    const payload = { ...(existing.data.payload || {}) } as Record<string, unknown>;
    const previousStatus = typeof payload.archivePreviousStatus === "string" && ["draft", "review", "approved", "published"].includes(payload.archivePreviousStatus)
      ? payload.archivePreviousStatus
      : "approved";
    delete payload.archivePreviousStatus;
    const restored = await client.from("tenant_content").update({ status: previousStatus, payload, updated_by: profile.userId, updated_at: now })
      .eq("id", id).eq("tenant_id", profile.tenantId)
      .select("id,title,content_type,status,payload,asset_path,created_at,updated_at").single();
    if (restored.error) return json({ error: "Inhalt konnte nicht wiederhergestellt werden" }, { status: 400 });
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "restore", entity_type: "content", entity_id: id, metadata: { title: existing.data.title, status: previousStatus } });
    return json({ ok: true, record: restored.data });
  }

  if (action === "delete_content") {
    const id = cleanText(body.id, 80);
    if (!id) return json({ error: "Inhalt fehlt" }, { status: 400 });
    const existing = await client.from("tenant_content").select("id,title,status,asset_path,payload").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (existing.error || !existing.data) return json({ error: "Inhalt nicht gefunden" }, { status: 404 });
    if (existing.data.status !== "archived") return json({ error: "Inhalte können nur aus dem Archiv endgültig gelöscht werden" }, { status: 409 });
    if (cleanText(body.confirmationName, 180) !== existing.data.title) return json({ error: "Der eingegebene Name stimmt nicht überein" }, { status: 409 });
    const sharedPartnerCopy = existing.data.payload?.partnerSource?.sharedAsset === true;
    if (!sharedPartnerCopy) {
      const acceptedPartnerOffers = await client.from("tenant_partner_content_offers").select("id", { count: "exact", head: true }).eq("source_content_id", id).eq("status", "accepted").not("recipient_content_id", "is", null);
      if (!acceptedPartnerOffers.error && (acceptedPartnerOffers.count || 0) > 0) {
        return json({ error: "Dieser Inhalt wird noch von einem Partnerbetrieb verwendet und kann deshalb nicht endgültig gelöscht werden" }, { status: 409 });
      }
    }
    const usage = await contentUsage(client, profile.tenantId, id);
    if (!sharedPartnerCopy && mediaUsesMux(existing.data.payload)) {
      const assetId = cleanText(existing.data.payload?.mux?.assetId, 180);
      const uploadId = cleanText(existing.data.payload?.mux?.uploadId, 180);
      try {
        if (assetId) await deleteMuxAsset(assetId);
        else if (uploadId) await deleteMuxDirectUpload(uploadId);
      } catch (reason) {
        console.error("Mux content cleanup failed", reason);
        return json({ error: "Das Video konnte beim Videodienst noch nicht endgültig gelöscht werden. Bitte versuchen Sie es erneut." }, { status: 503 });
      }
    }
    const removed = await client.from("tenant_content").delete().eq("id", id).eq("tenant_id", profile.tenantId);
    if (removed.error) return json({ error: "Inhalt konnte nicht gelöscht werden" }, { status: 400 });
    await bumpDisplayConfigurations(client, usage.displayIds);
    const storagePaths = sharedPartnerCopy ? [] : [mediaUsesMux(existing.data.payload) ? "" : existing.data.asset_path, typeof existing.data.payload?.posterPath === "string" ? existing.data.payload.posterPath : ""].filter(Boolean);
    if (storagePaths.length) {
      const storageRemoval = await client.storage.from(PORTAL_MEDIA_BUCKET).remove(storagePaths);
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
    const priority = Math.min(100, Math.max(0, Math.round(Number(body.priority) || 50)));
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
      priority,
      scope_site_id: scopeSiteId,
      scope_area_id: scopeAreaId,
      starts_at: startsAt,
      ends_at: endsAt,
      schedule: { portalSetupStep: 1 },
      created_by: profile.userId,
    }).select("id,name,theme,status,priority,scope_site_id,scope_area_id,starts_at,ends_at,schedule,created_at,updated_at").single();
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
    const screenSizeInchesRaw = Number(body.screenSizeInches);
    const screenSizeInches = [22, 24, 27, 32, 55, 65, 75].includes(screenSizeInchesRaw) ? screenSizeInchesRaw : null;
    const panelTechnology = cleanText(body.panelTechnology, 20) || "auto";
    const useCategoryRaw = cleanText(body.useCategory, 20);
    const useCategory = ["menu", "promotion", "wayfinding"].includes(useCategoryRaw) ? useCategoryRaw : null;
    if (!name || !siteId || !["display", "led_wall", "led_controller", "player"].includes(kind) || !["landscape", "portrait", "custom"].includes(orientation)) return json({ error: "Bildschirmangaben sind unvollständig" }, { status: 400 });
    if (!["auto", "display", "led"].includes(panelTechnology)) return json({ error: "Bildtechnologie ist ungültig" }, { status: 400 });
    const site = await client.from("tenant_sites").select("id").eq("id", siteId).eq("tenant_id", profile.tenantId).eq("active", true).maybeSingle();
    if (!site.data) return json({ error: "Standort nicht gefunden" }, { status: 404 });
    if (areaId) {
      const area = await client.from("tenant_areas").select("id").eq("id", areaId).eq("tenant_id", profile.tenantId).eq("site_id", siteId).eq("active", true).maybeSingle();
      if (!area.data) return json({ error: "Bereich nicht gefunden" }, { status: 404 });
    }
    const created = await client.from("tenant_displays").insert({ tenant_id: profile.tenantId, site_id: siteId, area_id: areaId, name, kind, orientation, screen_size_inches: screenSizeInches, panel_technology: panelTechnology, use_category: useCategory, status: "provisioning" }).select("id,name,status,kind,orientation,area_id,screen_size_inches,panel_technology,use_category").single();
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

  if (action === "set_display_fallback") {
    const displayId = cleanText(body.displayId, 80);
    const contentId = cleanText(body.contentId, 80) || null;
    if (!displayId) return json({ error: "Bildschirm fehlt" }, { status: 400 });
    if (contentId) {
      const content = await client.from("tenant_content").select("id,status").eq("id", contentId).eq("tenant_id", profile.tenantId).in("status", ["approved", "published"]).maybeSingle();
      if (!content.data) return json({ error: "Wählen Sie einen freigegebenen Ersatzinhalt" }, { status: 409 });
    }
    const updated = await client.from("tenant_displays").update({ fallback_content_id: contentId, updated_at: now }).eq("id", displayId).eq("tenant_id", profile.tenantId).select("id,name,fallback_content_id").maybeSingle();
    if (!updated.data) return json({ error: "Bildschirm nicht gefunden" }, { status: 404 });
    await bumpDisplayConfigurations(client, [displayId], "fallback");
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "fallback_changed", entity_type: "display", entity_id: displayId, metadata: { contentId } });
    return json({ ok: true, record: updated.data });
  }

  if (action === "test_publish_campaign") {
    const displayId = cleanText(body.displayId, 80);
    const campaignId = cleanText(body.campaignId, 80);
    const durationMinutes = Math.min(60, Math.max(5, Math.round(Number(body.durationMinutes) || 10)));
    if (!displayId || !campaignId) return json({ error: "Bildschirm oder Kampagne fehlt" }, { status: 400 });
    const [display, campaign, target, targetContent] = await Promise.all([
      client.from("tenant_displays").select("id,name,configuration_version").eq("id", displayId).eq("tenant_id", profile.tenantId).maybeSingle(),
      client.from("tenant_campaigns").select("id,name,status").eq("id", campaignId).eq("tenant_id", profile.tenantId).maybeSingle(),
      client.from("tenant_campaign_displays").select("display_id").eq("campaign_id", campaignId).eq("display_id", displayId).maybeSingle(),
      client.from("tenant_campaign_display_content").select("content:tenant_content(status)").eq("tenant_id", profile.tenantId).eq("campaign_id", campaignId).eq("display_id", displayId),
    ]);
    if (!display.data || !campaign.data || !target.data) return json({ error: "Die Kampagne ist diesem Bildschirm nicht vollständig zugeordnet" }, { status: 404 });
    if (!targetContent.data?.length || targetContent.data.some((entry: any) => !["approved", "published"].includes(relatedRecord(entry.content)?.status))) return json({ error: "Geben Sie zuerst alle Testinhalte frei" }, { status: 409 });
    const currentActive = await client.from("tenant_display_test_publications").select("id").eq("display_id", displayId).eq("status", "active").maybeSingle();
    if (currentActive.data) return json({ error: "Auf diesem Bildschirm läuft bereits eine Testveröffentlichung" }, { status: 409 });
    let previousVersion = Number(display.data.configuration_version || 0);
    let previousSnapshot = previousVersion ? await client.from("tenant_display_config_versions").select("version").eq("display_id", displayId).eq("version", previousVersion).maybeSingle() : { data: null };
    if (!previousSnapshot.data) {
      const baseline = await client.rpc("create_display_configuration_version", { target_display: displayId, next_configuration: await displayConfigurationBlueprint(client, displayId), version_source: "system", source_campaign: null, version_state: "active" });
      if (baseline.error) return json({ error: baseline.error.message }, { status: 400 });
      previousVersion = Number(baseline.data);
    }
    const testVersion = await client.rpc("create_display_configuration_version", { target_display: displayId, next_configuration: await displayConfigurationBlueprint(client, displayId, campaignId), version_source: "test", source_campaign: campaignId, version_state: "test" });
    if (testVersion.error) return json({ error: testVersion.error.message }, { status: 400 });
    const expiresAt = new Date(Date.now() + durationMinutes * 60_000).toISOString();
    const publication = await client.from("tenant_display_test_publications").insert({ tenant_id: profile.tenantId, display_id: displayId, campaign_id: campaignId, configuration_version: Number(testVersion.data), previous_version: previousVersion || null, expires_at: expiresAt, created_by: profile.userId }).select("id,configuration_version,expires_at").single();
    if (publication.error) return json({ error: publication.error.message }, { status: 400 });
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "test_publish", entity_type: "display", entity_id: displayId, metadata: { campaignId, testVersion: testVersion.data, previousVersion, expiresAt } });
    return json({ ok: true, publication: publication.data });
  }

  if (action === "rollback_display" || action === "cancel_display_test") {
    const displayId = cleanText(body.displayId, 80);
    if (!displayId) return json({ error: "Bildschirm fehlt" }, { status: 400 });
    let targetVersion = Math.max(0, Math.round(Number(body.version) || 0));
    let testId = "";
    if (action === "cancel_display_test") {
      const activeTest = await client.from("tenant_display_test_publications").select("id,previous_version").eq("display_id", displayId).eq("tenant_id", profile.tenantId).eq("status", "active").maybeSingle();
      if (!activeTest.data) return json({ error: "Es läuft keine Testveröffentlichung" }, { status: 409 });
      targetVersion = Number(activeTest.data.previous_version || 0);
      testId = activeTest.data.id;
    }
    const snapshot = targetVersion
      ? await client.from("tenant_display_config_versions").select("version,configuration").eq("display_id", displayId).eq("tenant_id", profile.tenantId).eq("version", targetVersion).maybeSingle()
      : { data: null };
    if (!snapshot.data) return json({ error: "Die gewünschte frühere Konfiguration ist nicht mehr verfügbar" }, { status: 404 });
    const rollback = await client.rpc("create_display_configuration_version", { target_display: displayId, next_configuration: snapshot.data.configuration, version_source: "rollback", source_campaign: null, version_state: "rolled_back" });
    if (rollback.error) return json({ error: rollback.error.message }, { status: 400 });
    if (testId) await client.from("tenant_display_test_publications").update({ status: "cancelled", completed_at: now }).eq("id", testId);
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "rollback", entity_type: "display", entity_id: displayId, metadata: { restoredVersion: targetVersion, newVersion: rollback.data } });
    return json({ ok: true, configurationVersion: Number(rollback.data) });
  }

  if (action === "acknowledge_display_alert") {
    const alertId = cleanText(body.alertId, 80);
    const result = await client.from("tenant_display_alerts").update({ status: "acknowledged", last_seen_at: now }).eq("id", alertId).eq("tenant_id", profile.tenantId).neq("status", "resolved").select("id").maybeSingle();
    if (!result.data) return json({ error: "Warnung nicht gefunden" }, { status: 404 });
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
    const screenSizeInchesRaw = Number(body.screenSizeInches);
    const screenSizeInches = [22, 24, 27, 32, 55, 65, 75].includes(screenSizeInchesRaw) ? screenSizeInchesRaw : null;
    const panelTechnology = cleanText(body.panelTechnology, 20) || "auto";
    const useCategoryRaw = cleanText(body.useCategory, 20);
    const useCategory = ["menu", "promotion", "wayfinding"].includes(useCategoryRaw) ? useCategoryRaw : null;
    if (!id || !name || !siteId || !["display", "led_wall", "led_controller", "player"].includes(kind) || !["landscape", "portrait", "custom"].includes(orientation)) return json({ error: "Bildschirmangaben sind unvollständig" }, { status: 400 });
    if (!["auto", "display", "led"].includes(panelTechnology)) return json({ error: "Bildtechnologie ist ungültig" }, { status: 400 });
    const site = await client.from("tenant_sites").select("id").eq("id", siteId).eq("tenant_id", profile.tenantId).eq("active", true).maybeSingle();
    if (!site.data) return json({ error: "Standort nicht gefunden" }, { status: 404 });
    if (areaId) {
      const area = await client.from("tenant_areas").select("id").eq("id", areaId).eq("tenant_id", profile.tenantId).eq("site_id", siteId).eq("active", true).maybeSingle();
      if (!area.data) return json({ error: "Bereich nicht gefunden" }, { status: 404 });
    }
    const result = await client.from("tenant_displays").update({ name, site_id: siteId, area_id: areaId, kind, orientation, screen_size_inches: screenSizeInches, panel_technology: panelTechnology, use_category: useCategory, updated_at: now })
      .eq("id", id).eq("tenant_id", profile.tenantId)
      .select("id,site_id,area_id,name,kind,status,orientation,resolution,screen_size_inches,panel_technology,use_category,created_at,updated_at").single();
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
    const priority = Math.min(100, Math.max(0, Math.round(Number(body.priority) || 50)));
    const startsAt = optionalDate(body.startsAt);
    const endsAt = optionalDate(body.endsAt);
    const setupStep = Math.min(4, Math.max(1, Math.round(Number(body.setupStep) || 1)));
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
    const campaign = await client.from("tenant_campaigns").select("id,status,schedule").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (campaign.error || !campaign.data) return json({ error: "Kampagne nicht gefunden" }, { status: 404 });
    if (contentIds.length) {
      const available = await client.from("tenant_content").select("id,content_type,status,asset_path,payload").eq("tenant_id", profile.tenantId).in("id", contentIds);
      if (available.error || available.data?.length !== contentIds.length) return json({ error: "Mindestens ein Motiv gehört nicht zu diesem Kunden" }, { status: 403 });
      if (available.data.some((item) => item.status === "archived" || (["image", "video"].includes(item.content_type) && (!item.asset_path || !mediaPayloadIsReady(item.payload))))) {
        return json({ error: "Mindestens ein Medium ist noch nicht displaybereit" }, { status: 409 });
      }
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
    const schedule = campaign.data.schedule && typeof campaign.data.schedule === "object" && !Array.isArray(campaign.data.schedule) ? campaign.data.schedule : {};
    await client.from("tenant_campaigns").update({ name, theme, priority, scope_site_id: scopeSiteId, scope_area_id: scopeAreaId, starts_at: startsAt, ends_at: endsAt, schedule: { ...schedule, portalSetupStep: setupStep }, updated_at: now }).eq("id", id).eq("tenant_id", profile.tenantId);
    await bumpDisplayConfigurations(client, [...(previousTargets.data ?? []).map((entry) => entry.display_id), ...displayIds], "campaign", id);
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "configure", entity_type: "campaign", entity_id: id, metadata: { contentCount: contentIds.length, displayCount: displayIds.length, targetedContentCount: totalContentItems } });
    return json({ ok: true });
  }

  if (action === "activate_campaign") {
    const id = cleanText(body.id, 80);
    if (!id) return json({ error: "Kampagne fehlt" }, { status: 400 });
    const campaign = await client.from("tenant_campaigns").select("id,name,status,priority,starts_at,ends_at").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (campaign.error || !campaign.data) return json({ error: "Kampagne nicht gefunden" }, { status: 404 });
    if (["completed", "archived"].includes(campaign.data.status)) return json({ error: "Diese Kampagne ist abgeschlossen" }, { status: 409 });
    const [contentLinks, displayLinks, targetContentLinks] = await Promise.all([
      client.from("tenant_campaign_content").select("content_id,content:tenant_content(status,content_type,asset_path,payload)").eq("campaign_id", id),
      client.from("tenant_campaign_displays").select("display_id").eq("campaign_id", id),
      client.from("tenant_campaign_display_content").select("display_id,content_id,content:tenant_content(status,content_type,asset_path,payload)").eq("campaign_id", id).eq("tenant_id", profile.tenantId),
    ]);
    if (!contentLinks.data?.length) return json({ error: "Fügen Sie der Kampagne mindestens ein Motiv hinzu" }, { status: 409 });
    const unapproved = contentLinks.data.some((link) => {
      const relation = Array.isArray(link.content) ? link.content[0] : link.content;
      return !relation || !["approved", "published"].includes(relation.status) || (["image", "video"].includes(relation.content_type) && (!relation.asset_path || !mediaPayloadIsReady(relation.payload)));
    });
    if (unapproved) return json({ error: "Geben Sie alle gewählten Motive vor dem Start frei" }, { status: 409 });
    if (!displayLinks.data?.length) return json({ error: "Wählen Sie mindestens einen Bildschirm aus" }, { status: 409 });
    const configuredTargets = new Set((targetContentLinks.data ?? []).map((link) => link.display_id));
    const missingTarget = displayLinks.data.find((link) => !configuredTargets.has(link.display_id));
    if (missingTarget) return json({ error: "Weisen Sie jedem gewählten Bildschirm mindestens ein Motiv zu" }, { status: 409 });
    const unapprovedTargetContent = (targetContentLinks.data ?? []).some((link) => {
      const relation = Array.isArray(link.content) ? link.content[0] : link.content;
      return !relation || !["approved", "published"].includes(relation.status) || (["image", "video"].includes(relation.content_type) && (!relation.asset_path || !mediaPayloadIsReady(relation.payload)));
    });
    if (unapprovedTargetContent) return json({ error: "Geben Sie alle zielbezogenen Motive vor dem Start frei" }, { status: 409 });
    if (campaign.data.ends_at && new Date(campaign.data.ends_at).getTime() <= Date.now()) return json({ error: "Das Enddatum liegt bereits in der Vergangenheit" }, { status: 409 });
    const campaignRecord = campaign.data;
    const conflicts = await campaignConflicts(client, campaignRecord);
    if (conflicts.length) {
      const first = conflicts[0];
      await Promise.all([...new Set(conflicts.map((conflict) => conflict.displayId))].map((displayId) => client.from("tenant_display_alerts").upsert({ tenant_id: profile.tenantId, display_id: displayId, kind: "campaign_conflict", severity: "warning", status: "open", message: `Zeitkonflikt zwischen „${campaignRecord.name}“ und einer Kampagne gleicher Priorität.`, metadata: { campaignId: id, conflicts }, last_seen_at: now, resolved_at: null }, { onConflict: "display_id,kind" })));
      return json({ error: `Auf „${first.displayName}“ läuft im gleichen Zeitraum bereits „${first.campaignName}“ mit derselben Priorität. Ändern Sie Zeitraum oder Priorität.`, conflicts }, { status: 409 });
    }
    await client.from("tenant_display_alerts").update({ status: "resolved", resolved_at: now, last_seen_at: now }).in("display_id", (displayLinks.data ?? []).map((link) => link.display_id)).eq("kind", "campaign_conflict").neq("status", "resolved");
    const nextStatus = campaign.data.starts_at && new Date(campaign.data.starts_at).getTime() > Date.now() ? "scheduled" : "active";
    const result = await client.from("tenant_campaigns").update({ status: nextStatus, updated_at: now }).eq("id", id).eq("tenant_id", profile.tenantId).select("id,status").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    const targets = await client.from("tenant_campaign_displays").select("display_id").eq("campaign_id", id);
    await bumpDisplayConfigurations(client, (targets.data ?? []).map((entry) => entry.display_id), "campaign", id);
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

async function handlePortalDocument(request: Request): Promise<Response> {
  const authorized = await authorizePortal(request);
  if (isResponse(authorized)) return authorized;
  const { profile } = authorized;
  const admin = dashboardSupabase();
  if (!admin) return json({ error: "Dokumentenservice ist nicht konfiguriert" }, { status: 503 });
  const search = new URL(request.url).searchParams;
  const kind = cleanText(search.get("portalDocument"), 30);
  const id = cleanText(search.get("id"), 80);
  if (!id || !["quote", "invoice"].includes(kind)) return json({ error: "Dokument fehlt" }, { status: 400 });
  const record = kind === "quote"
    ? await admin.from("quotes").select("id,quote_number,immutable_pdf_path,status").eq("id", id).eq("client_id", profile.clientId).in("status", ["sent", "viewed", "accepted", "declined", "expired"]).maybeSingle()
    : await admin.from("invoices").select("id,invoice_number,immutable_pdf_path,status").eq("id", id).eq("client_id", profile.clientId).maybeSingle();
  if (!record.data?.immutable_pdf_path) return json({ error: "Dieses Dokument ist noch nicht verfügbar" }, { status: 404 });
  const signed = await admin.storage.from("swisscompact-documents").createSignedUrl(record.data.immutable_pdf_path, 10 * 60);
  if (signed.error || !signed.data?.signedUrl) return json({ error: "Dokument konnte nicht geöffnet werden" }, { status: 503 });
  await admin.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "customer_document_opened", entity_type: kind, entity_id: id, metadata: { status: record.data.status } });
  return json({ ok: true, url: signed.data.signedUrl, expiresIn: 600 });
}

async function handlePortalProjectFile(request: Request): Promise<Response> {
  const authorized = await authorizePortal(request);
  if (isResponse(authorized)) return authorized;
  const { profile } = authorized;
  const admin = dashboardSupabase();
  if (!admin) return json({ error: "Dateiservice ist nicht konfiguriert" }, { status: 503 });
  const versionId = cleanText(new URL(request.url).searchParams.get("portalProjectFile"), 80);
  if (!versionId) return json({ error: "Dateiversion fehlt" }, { status: 400 });
  const version = await admin.from("project_deliverable_versions").select("id,project_id,storage_path,file_name,upload_state").eq("id", versionId).eq("client_id", profile.clientId).eq("tenant_id", profile.tenantId).eq("upload_state", "ready").maybeSingle();
  if (!version.data) return json({ error: "Datei nicht gefunden" }, { status: 404 });
  const project = await portalProject(admin, profile, version.data.project_id);
  if (!project) return json({ error: "Auftrag nicht gefunden" }, { status: 404 });
  const signed = await admin.storage.from(PORTAL_MEDIA_BUCKET).createSignedUrl(version.data.storage_path, 10 * 60, { download: version.data.file_name });
  if (signed.error || !signed.data?.signedUrl) return json({ error: "Datei konnte nicht geöffnet werden" }, { status: 503 });
  await admin.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "project_file_opened", entity_type: "project", entity_id: project.id, metadata: { versionId, fileName: version.data.file_name } });
  return json({ ok: true, url: signed.data.signedUrl, expiresIn: 600 });
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
  if (search.get("integration") === "mux-webhook") return handleMuxWebhookPost(request);
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

  if (action === "update_service_request_status") {
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 40);
    if (!id || !["submitted", "planning", "production", "completed", "declined"].includes(status)) return json({ error: "Ungültiger Produktionsstatus" }, { status: 400 });
    const existing = await client.from("tenant_content").select("id,tenant_id,title,payload").eq("id", id).contains("payload", { serviceRequest: true }).maybeSingle();
    if (existing.error || !existing.data) return json({ error: "Produktionsanfrage nicht gefunden" }, { status: 404 });
    const payload = { ...(existing.data.payload || {}), serviceRequestStatus: status };
    const result = await client.from("tenant_content").update({ payload, updated_at: new Date().toISOString() }).eq("id", id).select("id,title,status,payload,updated_at").single();
    if (result.error) return json({ error: "Produktionsstatus konnte nicht gespeichert werden" }, { status: 400 });
    const opportunityId = cleanText(existing.data.payload?.opportunityId, 80);
    if (opportunityId) {
      const stage = status === "planning" ? "consulting" : status === "completed" ? "completed" : status === "declined" ? "lost" : null;
      const nextAction = status === "submitted"
        ? "Produktionsanfrage prüfen, Umfang klären und Offerte vorbereiten"
        : status === "planning"
          ? "Leistungsumfang kalkulieren und Offerte erstellen"
          : status === "production"
            ? "Produktion umsetzen und Kundin oder Kunden informieren"
            : null;
      const opportunityUpdate: Record<string, unknown> = { next_action: nextAction, updated_at: new Date().toISOString() };
      if (stage) opportunityUpdate.stage = stage;
      let opportunityUpdateQuery = client.from("opportunities").update(opportunityUpdate).eq("id", opportunityId).eq("portal_request_id", id);
      if (status === "planning") opportunityUpdateQuery = opportunityUpdateQuery.in("stage", ["request", "qualification", "consulting"]);
      if (status === "declined") opportunityUpdateQuery = opportunityUpdateQuery.in("stage", ["request", "qualification", "consulting", "customer_decision", "quote"]);
      await opportunityUpdateQuery;
    }
    await writeAudit(client, profile, "status_change", "content_request", id, { serviceRequestStatus: existing.data.payload?.serviceRequestStatus }, { serviceRequestStatus: status });
    if (existing.data.payload?.serviceRequestStatus !== status) {
      const tenant = await client.from("tenants").select("client_id").eq("id", existing.data.tenant_id).maybeSingle();
      const statusLabels: Record<string, string> = { submitted: "eingegangen", planning: "in Planung", production: "in Produktion", completed: "abgeschlossen", declined: "nicht weitergeführt" };
      await sendCustomerStatusNotification(
        client,
        tenant.data?.client_id,
        `Produktionsanfrage: ${existing.data.title}`,
        `Ihre Anfrage ist ${statusLabels[status] || status}`,
        `Der Status Ihrer Produktionsanfrage „${existing.data.title}“ wurde aktualisiert. Sie ist jetzt ${statusLabels[status] || status}.`,
      );
    }
    return json({ ok: true, record: result.data });
  }

  if (action === "set_client_portal_verification") {
    const id = cleanText(body.id, 80);
    const verified = body.verified === true;
    if (!id) return json({ error: "Kunde fehlt" }, { status: 400 });
    const previous = await client.from("clients").select("id,company_name,lifecycle,portal_verified_at,portal_verified_by").eq("id", id).single();
    if (previous.error) return json({ error: "Kunde nicht gefunden" }, { status: 404 });
    if (verified && previous.data.lifecycle !== "customer") {
      return json({ error: "Portalzugriff kann nur für einen registrierten Kunden verifiziert werden" }, { status: 409 });
    }
    const update = verified
      ? { portal_verified_at: new Date().toISOString(), portal_verified_by: profile.userId, updated_at: new Date().toISOString() }
      : { portal_verified_at: null, portal_verified_by: null, updated_at: new Date().toISOString() };
    const result = await client.from("clients").update(update).eq("id", id).select("*").single();
    if (result.error) return json({ error: "Portal-Verifizierung konnte nicht gespeichert werden" }, { status: 400 });
    await writeAudit(client, profile, verified ? "portal_verify" : "portal_revoke", "client", id, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "provision_client_portal") {
    if (!["owner_admin", "admin"].includes(profile.role)) return json({ error: "Nur Administratoren dürfen Kundenportale einrichten" }, { status: 403 });
    const admin = dashboardSupabase();
    if (!admin) return json({ error: "Portalverwaltung ist nicht konfiguriert" }, { status: 503 });
    const clientId = cleanText(body.clientId, 80);
    const packageCode = cleanText(body.packageCode, 40);
    const ownerNameInput = cleanText(body.ownerName, 160);
    const ownerEmail = cleanText(body.ownerEmail, 240).toLowerCase();
    if (!clientId || !["essential", "business", "enterprise"].includes(packageCode)) return json({ error: "Kunde oder Portalpaket fehlt" }, { status: 400 });
    if (!validEmail(ownerEmail)) return json({ error: "Eine gültige persönliche E-Mail-Adresse ist erforderlich" }, { status: 400 });
    const packageDetails = await admin.from("subscription_packages").select("code,monthly_base_chf,included_ai_credits,active").eq("code", packageCode).eq("active", true).maybeSingle();
    if (!packageDetails.data) return json({ error: "Dieses Portalpaket ist nicht verfügbar" }, { status: 409 });
    const customer = await admin.from("clients").select("id,company_name,contact_name,email,lifecycle,portal_verified_at,tenant:tenants(id,name,slug,status,client_id)").eq("id", clientId).maybeSingle();
    if (!customer.data) return json({ error: "Kundenkartei nicht gefunden" }, { status: 404 });
    if (customer.data.lifecycle !== "customer") return json({ error: "Die Kundenkartei muss zuerst den Status Kunde erhalten" }, { status: 409 });
    const ownerName = ownerNameInput || customer.data.contact_name || ownerEmail.split("@")[0];
    const existingTenant = Array.isArray(customer.data.tenant) ? customer.data.tenant[0] : customer.data.tenant;
    const now = new Date().toISOString();
    const verifiedCustomer = await admin.from("clients").update({ portal_verified_at: customer.data.portal_verified_at || now, portal_verified_by: profile.userId, updated_at: now }).eq("id", clientId).eq("lifecycle", "customer");
    if (verifiedCustomer.error) return json({ error: "Kunde konnte nicht für das Portal verifiziert werden" }, { status: 400 });
    let tenant = existingTenant;
    if (!tenant) {
      const slug = await uniqueTenantSlug(admin, customer.data.company_name);
      const createdTenant = await admin.from("tenants").insert({ client_id: clientId, name: customer.data.company_name, slug, status: "onboarding", branding: { accent: "#d90d32" }, enabled_modules: ["portal", "content", "campaigns", "displays", "ai"] }).select("id,name,slug,status,client_id").single();
      if (createdTenant.error) return json({ error: `Portal-Arbeitsbereich konnte nicht angelegt werden: ${createdTenant.error.message}` }, { status: 400 });
      tenant = createdTenant.data;
    }
    let invitation;
    try {
      invitation = await createPortalInvitation(admin, request, ownerEmail, ownerName, tenant.id);
    } catch (reason) {
      return json({ error: reason instanceof Error ? reason.message : "Portalbenutzer konnte nicht eingeladen werden" }, { status: 503 });
    }
    const alreadyConfirmed = Boolean(invitation.user.email_confirmed_at);
    const membership = await admin.from("tenant_memberships").upsert({
      tenant_id: tenant.id,
      user_id: invitation.user.id,
      role: "owner",
      display_name: ownerName,
      active: alreadyConfirmed,
      access_status: alreadyConfirmed ? "active" : "invited",
      invited_at: now,
      invited_by: profile.userId,
      accepted_at: alreadyConfirmed ? invitation.user.email_confirmed_at : null,
      verified_at: alreadyConfirmed ? invitation.user.email_confirmed_at : null,
      revoked_at: null,
    }, { onConflict: "tenant_id,user_id" }).select("id,tenant_id,user_id,role,display_name,active,access_status,invited_at,accepted_at,verified_at").single();
    if (membership.error) return json({ error: `Portalberechtigung konnte nicht gespeichert werden: ${membership.error.message}` }, { status: 400 });
    const tenantStatus = existingTenant?.status === "active" || alreadyConfirmed ? "active" : "onboarding";
    await admin.from("tenants").update({ status: tenantStatus, updated_at: now }).eq("id", tenant.id).eq("client_id", clientId);
    const currentSubscription = await admin.from("tenant_subscriptions").select("id").eq("tenant_id", tenant.id).in("status", ["trial", "active", "past_due", "paused"]).maybeSingle();
    const minimumEnd = new Date(); minimumEnd.setFullYear(minimumEnd.getFullYear() + 1);
    const subscriptionRecord = { package_code: packageCode, status: "active", starts_on: now.slice(0, 10), minimum_ends_on: minimumEnd.toISOString().slice(0, 10), monthly_amount_chf: packageDetails.data.monthly_base_chf, included_ai_credits: packageDetails.data.included_ai_credits, updated_at: now };
    const subscription = currentSubscription.data
      ? await admin.from("tenant_subscriptions").update(subscriptionRecord).eq("id", currentSubscription.data.id)
      : await admin.from("tenant_subscriptions").insert({ tenant_id: tenant.id, ...subscriptionRecord });
    if (subscription.error) return json({ error: `Portalpaket konnte nicht gespeichert werden: ${subscription.error.message}` }, { status: 400 });
    let invitationSent = false;
    if (invitation.invitationUrl) {
      try { invitationSent = await sendPortalInvitation(ownerEmail, ownerName, customer.data.company_name, invitation.invitationUrl); }
      catch (reason) { return json({ error: reason instanceof Error ? reason.message : "Einladung konnte nicht versendet werden", invitationUrl: invitation.invitationUrl }, { status: 503 }); }
    }
    await admin.from("tenant_audit_log").insert({ tenant_id: tenant.id, actor_user_id: profile.userId, action: existingTenant ? "portal_onboarding_updated" : "portal_onboarding_created", entity_type: "tenant", entity_id: tenant.id, metadata: { clientId, packageCode, ownerEmail, membershipId: membership.data.id, invitationSent } });
    await writeAudit(client, profile, existingTenant ? "portal_onboarding_update" : "portal_onboarding_create", "client", clientId, customer.data, { tenantId: tenant.id, packageCode, ownerEmail, membershipStatus: membership.data.access_status });
    return json({ ok: true, tenant: { ...tenant, status: tenantStatus }, membership: membership.data, packageCode, invitationSent, invitationUrl: invitationSent ? null : invitation.invitationUrl, alreadyConfirmed });
  }

  if (action === "resend_portal_invitation") {
    if (!["owner_admin", "admin"].includes(profile.role)) return json({ error: "Nur Administratoren dürfen Einladungen versenden" }, { status: 403 });
    const admin = dashboardSupabase();
    if (!admin) return json({ error: "Portalverwaltung ist nicht konfiguriert" }, { status: 503 });
    const membershipId = cleanText(body.membershipId, 80);
    const membership = await admin.from("tenant_memberships").select("id,tenant_id,user_id,display_name,access_status,tenant:tenants(id,name,client_id,client:clients(company_name,lifecycle,portal_verified_at))").eq("id", membershipId).maybeSingle();
    if (!membership.data) return json({ error: "Portalbenutzer nicht gefunden" }, { status: 404 });
    const membershipRecord = membership.data;
    if (membershipRecord.access_status !== "invited") return json({ error: "Nur offene Einladungen können erneut versendet werden" }, { status: 409 });
    const userLookup = await admin.auth.admin.getUserById(membershipRecord.user_id);
    const portalUser = userLookup.data?.user;
    if (!portalUser?.email) return json({ error: "E-Mail-Adresse des Portalbenutzers fehlt" }, { status: 409 });
    const tenant = Array.isArray(membershipRecord.tenant) ? membershipRecord.tenant[0] : membershipRecord.tenant;
    const company = Array.isArray(tenant?.client) ? tenant.client[0] : tenant?.client;
    if (!tenant || !company || company.lifecycle !== "customer" || !company.portal_verified_at) return json({ error: "Kundenportal ist nicht verifiziert" }, { status: 409 });
    let invitation;
    try { invitation = await createPortalInvitation(admin, request, portalUser.email, membershipRecord.display_name || portalUser.email.split("@")[0], tenant.id); }
    catch (reason) { return json({ error: reason instanceof Error ? reason.message : "Einladungslink konnte nicht erstellt werden" }, { status: 503 }); }
    if (!invitation.invitationUrl) return json({ error: "Dieser Benutzer ist bereits bestätigt und kann aktiviert werden" }, { status: 409 });
    try {
      const sent = await sendPortalInvitation(portalUser.email, membershipRecord.display_name || portalUser.email.split("@")[0], company.company_name, invitation.invitationUrl);
      await admin.from("tenant_memberships").update({ invited_at: new Date().toISOString(), invited_by: profile.userId }).eq("id", membershipId).eq("access_status", "invited");
      await writeAudit(client, profile, "portal_invitation_resent", "membership", membershipId, undefined, { email: portalUser.email, sent });
      return json({ ok: true, invitationSent: sent, invitationUrl: sent ? null : invitation.invitationUrl });
    } catch (reason) { return json({ error: reason instanceof Error ? reason.message : "Einladung konnte nicht gesendet werden", invitationUrl: invitation.invitationUrl }, { status: 503 }); }
  }

  if (action === "update_portal_member_access") {
    if (!["owner_admin", "admin"].includes(profile.role)) return json({ error: "Nur Administratoren dürfen Portalzugänge ändern" }, { status: 403 });
    const admin = dashboardSupabase();
    if (!admin) return json({ error: "Portalverwaltung ist nicht konfiguriert" }, { status: 503 });
    const membershipId = cleanText(body.membershipId, 80);
    const accessStatus = cleanText(body.accessStatus, 30);
    const role = cleanText(body.role, 30);
    if (!membershipId || !["active", "suspended", "revoked"].includes(accessStatus) || !["owner", "admin", "editor", "viewer"].includes(role)) return json({ error: "Ungültige Rolle oder Zugriffsart" }, { status: 400 });
    const previous = await admin.from("tenant_memberships").select("*").eq("id", membershipId).maybeSingle();
    if (!previous.data) return json({ error: "Portalbenutzer nicht gefunden" }, { status: 404 });
    if ((accessStatus !== "active" || !["owner", "admin"].includes(role)) && ["owner", "admin"].includes(previous.data.role) && previous.data.active) {
      const administrators = await admin.from("tenant_memberships").select("id").eq("tenant_id", previous.data.tenant_id).eq("access_status", "active").in("role", ["owner", "admin"]).neq("id", membershipId);
      if (!administrators.data?.length) return json({ error: "Der letzte aktive Inhaber oder Administrator darf nicht gesperrt werden" }, { status: 409 });
    }
    const now = new Date().toISOString();
    const updated = await admin.from("tenant_memberships").update({ role, access_status: accessStatus, active: accessStatus === "active", revoked_at: accessStatus === "revoked" ? now : null }).eq("id", membershipId).select("*").single();
    if (updated.error) return json({ error: updated.error.message }, { status: 400 });
    await admin.from("tenant_audit_log").insert({ tenant_id: previous.data.tenant_id, actor_user_id: profile.userId, action: `membership_${accessStatus}`, entity_type: "membership", entity_id: membershipId, metadata: { previousRole: previous.data.role, role } });
    await writeAudit(client, profile, "portal_member_access", "membership", membershipId, previous.data, updated.data);
    return json({ ok: true, record: updated.data });
  }

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
      portal_verified_at: lifecycle === "customer" ? previous.data.portal_verified_at : null,
      portal_verified_by: lifecycle === "customer" ? previous.data.portal_verified_by : null,
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
    const tenant = await client.from("tenants").select("id").eq("client_id", opportunity.data.client_id).maybeSingle();
    const projectRecord: Record<string, unknown> = {
      opportunity_id: opportunityId,
      client_id: opportunity.data.client_id,
      ...(tenant.data?.id ? { tenant_id: tenant.data.id } : {}),
      title: opportunity.data.title,
      status: "planning",
      software_owner: marcel,
      hardware_owner: thomas,
      starts_on: typeof body.startsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startsOn) ? body.startsOn : null,
      target_completion: typeof body.targetCompletion === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.targetCompletion) ? body.targetCompletion : null,
    };
    let project = await client.from("projects").insert(projectRecord).select("*").single();
    if (project.error && tenant.data?.id && /tenant_id|schema cache/i.test(project.error.message || "")) {
      delete projectRecord.tenant_id;
      project = await client.from("projects").insert(projectRecord).select("*").single();
    }
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
      starts_on: body.startsOn === undefined ? previous.data.starts_on : typeof body.startsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startsOn) ? body.startsOn : null,
      target_completion: body.targetCompletion === undefined ? previous.data.target_completion : typeof body.targetCompletion === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.targetCompletion) ? body.targetCompletion : null,
      updated_at: new Date().toISOString(),
    };
    if (!update.title) return json({ error: "Projekttitel fehlt" }, { status: 400 });
    const result = await client.from("projects").update(update).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await client.from("approvals").update({ invalidated_at: new Date().toISOString() }).eq("entity_id", id).is("executed_at", null).is("invalidated_at", null);
    await writeAudit(client, profile, "update", "project", id, previous.data, result.data);
    if (previous.data.status !== status) {
      const projectStatusLabels: Record<string, string> = { planning: "in Planung", active: "in Umsetzung", blocked: "mit einer offenen Rückfrage", acceptance: "bereit zur Abnahme", completed: "abgeschlossen", cancelled: "storniert" };
      const target = result.data.target_completion ? ` Der aktuelle Zieltermin ist der ${new Date(`${result.data.target_completion}T12:00:00`).toLocaleDateString("de-CH")}.` : "";
      await sendCustomerStatusNotification(
        client,
        result.data.client_id,
        `Auftragsstatus: ${result.data.title}`,
        `Ihr Auftrag ist ${projectStatusLabels[status] || status}`,
        `Der Auftrag „${result.data.title}“ ist jetzt ${projectStatusLabels[status] || status}.${target}`,
      );
    }
    return json({ ok: true, record: result.data });
  }

  if (action === "update_project_briefing") {
    const projectId = cleanText(body.projectId, 80);
    if (!projectId) return json({ error: "Projekt fehlt" }, { status: 400 });
    const previous = await client.from("projects").select("id,client_id,tenant_id,title,briefing").eq("id", projectId).single();
    if (previous.error || !previous.data.tenant_id) return json({ error: "Projekt ist noch keiner Portalakte zugeordnet" }, { status: 409 });
    const briefing = {
      objective: cleanText(body.objective, 3000),
      audience: cleanText(body.audience, 1500),
      keyMessage: cleanText(body.keyMessage, 1500),
      formats: cleanText(body.formats, 1500),
      notes: cleanText(body.notes, 3000),
      updatedAt: new Date().toISOString(),
      updatedBy: profile.displayName,
    };
    const result = await client.from("projects").update({ briefing, updated_at: new Date().toISOString() }).eq("id", projectId).select("id,briefing").single();
    if (result.error) return json({ error: "Briefing konnte nicht gespeichert werden" }, { status: 400 });
    await writeAudit(client, profile, "update", "project_briefing", projectId, previous.data.briefing, briefing);
    return json({ ok: true, record: result.data });
  }

  if (action === "post_dashboard_project_message") {
    const projectId = cleanText(body.projectId, 80);
    const message = cleanText(body.message, 5000);
    const visibleToCustomer = body.visibleToCustomer !== false;
    if (!projectId || !message) return json({ error: "Projekt oder Nachricht fehlt" }, { status: 400 });
    const project = await client.from("projects").select("id,client_id,tenant_id,title,order_number").eq("id", projectId).single();
    if (project.error || !project.data.client_id || !project.data.tenant_id) return json({ error: "Projekt ist noch keiner Portalakte zugeordnet" }, { status: 409 });
    const result = await client.from("project_messages").insert({ project_id: projectId, client_id: project.data.client_id, tenant_id: project.data.tenant_id, author_user_id: profile.userId, author_type: "swisscompact", author_name: profile.displayName, body: message, visible_to_customer: visibleToCustomer }).select("*").single();
    if (result.error) return json({ error: "Nachricht konnte nicht gespeichert werden" }, { status: 400 });
    await writeAudit(client, profile, "create", "project_message", result.data.id, undefined, { projectId, visibleToCustomer });
    if (visibleToCustomer) await sendCustomerStatusNotification(client, project.data.client_id, `Neue Nachricht zu ${project.data.order_number}`, "Neue Nachricht von SwissCompact", `Beim Auftrag „${project.data.title}“ gibt es eine neue Nachricht: ${message}`);
    return json({ ok: true, record: result.data });
  }

  if (action === "prepare_project_deliverable_upload") {
    const projectId = cleanText(body.projectId, 80);
    const existingDeliverableId = cleanText(body.deliverableId, 80);
    const title = cleanText(body.title, 180);
    const fileName = safeFileName(body.fileName);
    const mimeType = cleanText(body.mimeType, 100).toLowerCase();
    const sizeBytes = Math.max(0, Math.floor(Number(body.sizeBytes) || 0));
    const fileConfig = PROJECT_FILE_TYPES[mimeType];
    if (!projectId || !title || !fileConfig || sizeBytes < 1 || sizeBytes > fileConfig.maxBytes) return json({ error: "Datei, Titel oder Dateigrösse wird nicht unterstützt" }, { status: 400 });
    const project = await client.from("projects").select("id,client_id,tenant_id,title,order_number").eq("id", projectId).single();
    if (project.error || !project.data.client_id || !project.data.tenant_id) return json({ error: "Projekt ist noch keiner Portalakte zugeordnet" }, { status: 409 });
    let deliverable: any;
    if (existingDeliverableId) {
      const existing = await client.from("project_deliverables").select("*").eq("id", existingDeliverableId).eq("project_id", projectId).eq("client_id", project.data.client_id).eq("tenant_id", project.data.tenant_id).maybeSingle();
      if (!existing.data || ["archived", "published"].includes(existing.data.status)) return json({ error: "Dieser Entwurf kann nicht mehr versioniert werden" }, { status: 409 });
      deliverable = existing.data;
    } else {
      const kind = ["image", "video", "design", "document", "campaign"].includes(String(body.kind)) ? body.kind : fileConfig.kind;
      const created = await client.from("project_deliverables").insert({ project_id: projectId, client_id: project.data.client_id, tenant_id: project.data.tenant_id, title, kind, status: "draft", current_version: 0, created_by: profile.userId }).select("*").single();
      if (created.error) return json({ error: "Entwurf konnte nicht erstellt werden" }, { status: 400 });
      deliverable = created.data;
    }
    const versionNumber = Number(deliverable.current_version || 0) + 1;
    const storagePath = `${project.data.tenant_id}/projects/${projectId}/${deliverable.id}/v${versionNumber}-${randomBytes(12).toString("hex")}.${fileConfig.extension}`;
    const signed = await client.storage.from(PORTAL_MEDIA_BUCKET).createSignedUploadUrl(storagePath);
    if (signed.error || !signed.data?.token) return json({ error: "Upload konnte nicht vorbereitet werden" }, { status: 503 });
    const version = await client.from("project_deliverable_versions").insert({ deliverable_id: deliverable.id, project_id: projectId, client_id: project.data.client_id, tenant_id: project.data.tenant_id, version: versionNumber, storage_path: storagePath, file_name: fileName, mime_type: mimeType, size_bytes: sizeBytes, notes: cleanText(body.notes, 1500) || null, upload_state: "uploading", submitted_by: profile.userId, submitted_by_type: "swisscompact" }).select("id").single();
    if (version.error) return json({ error: "Dateiversion konnte nicht vorbereitet werden" }, { status: 400 });
    return json({ ok: true, deliverableId: deliverable.id, versionId: version.data.id, version: versionNumber, upload: { signedUrl: signed.data.signedUrl, path: signed.data.path } });
  }

  if (action === "finalize_project_deliverable_upload") {
    const versionId = cleanText(body.versionId, 80);
    if (!versionId) return json({ error: "Dateiversion fehlt" }, { status: 400 });
    const version = await client.from("project_deliverable_versions").select("*").eq("id", versionId).eq("submitted_by", profile.userId).maybeSingle();
    if (!version.data) return json({ error: "Dateiversion nicht gefunden" }, { status: 404 });
    const project = await client.from("projects").select("id,client_id,tenant_id,title,order_number").eq("id", version.data.project_id).single();
    const deliverable = await client.from("project_deliverables").select("id,title,current_version,status").eq("id", version.data.deliverable_id).single();
    if (project.error || deliverable.error || !project.data.tenant_id || Number(deliverable.data.current_version) + 1 !== Number(version.data.version)) return json({ error: "Die Versionsfolge wurde zwischenzeitlich geändert" }, { status: 409 });
    const parts = version.data.storage_path.split("/"); const file = parts.pop() || ""; const directory = parts.join("/");
    const stored = await client.storage.from(PORTAL_MEDIA_BUCKET).list(directory, { limit: 10, search: file });
    if (stored.error || !stored.data?.some((entry) => entry.name === file)) return json({ error: "Datei wurde noch nicht vollständig übertragen" }, { status: 409 });
    const finalized = await Promise.all([
      client.from("project_deliverable_versions").update({ upload_state: "ready" }).eq("id", versionId).eq("upload_state", "uploading"),
      client.from("project_deliverables").update({ current_version: version.data.version, status: "customer_review", updated_at: new Date().toISOString() }).eq("id", deliverable.data.id).eq("current_version", deliverable.data.current_version),
      client.from("project_messages").insert({ project_id: project.data.id, client_id: project.data.client_id, tenant_id: project.data.tenant_id, author_type: "system", author_name: "SwissCompact", body: `Version ${version.data.version} von „${deliverable.data.title}“ ist zur Kundenprüfung bereit.`, visible_to_customer: true }),
    ]);
    if (finalized.some((result) => result.error)) return json({ error: "Die Datei wurde übertragen, konnte aber noch nicht zur Prüfung freigegeben werden" }, { status: 409 });
    await writeAudit(client, profile, "version_created", "project_deliverable", deliverable.data.id, undefined, { versionId, version: version.data.version, projectId: project.data.id });
    await sendCustomerStatusNotification(client, project.data.client_id, `Entwurf zur Prüfung · ${project.data.order_number}`, "Ein neuer Entwurf ist bereit", `Version ${version.data.version} von „${deliverable.data.title}“ kann jetzt im Kundenportal geprüft, freigegeben oder mit einem Änderungswunsch zurückgegeben werden.`);
    return json({ ok: true });
  }

  if (action === "scope_project_revision") {
    const revisionId = cleanText(body.revisionId, 80);
    const responseText = cleanText(body.responseText, 3000);
    const included = body.included === true;
    const additionalCost = included ? 0 : amount(body.additionalCostChf);
    if (!revisionId || !responseText) return json({ error: "Korrekturrunde oder Antwort fehlt" }, { status: 400 });
    if (!included && additionalCost <= 0) return json({ error: "Zusatzkosten müssen klar ausgewiesen werden oder als enthalten markiert sein" }, { status: 400 });
    const revision = await client.from("project_revision_rounds").select("*,project:projects(title,order_number)").eq("id", revisionId).in("status", ["requested", "scoping"]).maybeSingle();
    if (!revision.data) return json({ error: "Korrekturrunde wurde bereits bearbeitet" }, { status: 409 });
    const status = included ? "approved" : "customer_approval";
    const result = await client.from("project_revision_rounds").update({ response_text: responseText, included, additional_cost_chf: additionalCost, status, updated_at: new Date().toISOString() }).eq("id", revisionId).in("status", ["requested", "scoping"]).select("*").single();
    if (result.error) return json({ error: "Korrekturrunde konnte nicht kalkuliert werden" }, { status: 400 });
    await writeAudit(client, profile, "revision_scoped", "project_revision", revisionId, revision.data, result.data);
    if (!included) await sendCustomerStatusNotification(client, revision.data.client_id, `Kostenfreigabe · ${relatedRecord(revision.data.project)?.order_number || "Auftrag"}`, "Korrekturrunde zur Bestätigung", `Für Korrekturrunde ${revision.data.round_number} wurden Zusatzkosten von ${new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(additionalCost)} ausgewiesen. Bitte prüfen und entscheiden Sie im Kundenportal.`);
    return json({ ok: true, record: result.data });
  }

  if (action === "update_project_revision_status") {
    const revisionId = cleanText(body.revisionId, 80);
    const status = cleanText(body.status, 40);
    if (!revisionId || !["in_progress", "completed"].includes(status)) return json({ error: "Korrekturstatus ist ungültig" }, { status: 400 });
    const previous = await client.from("project_revision_rounds").select("*").eq("id", revisionId).maybeSingle();
    if (!previous.data || (status === "in_progress" && previous.data.status !== "approved") || (status === "completed" && previous.data.status !== "in_progress")) return json({ error: "Dieser Statuswechsel ist nicht möglich" }, { status: 409 });
    const result = await client.from("project_revision_rounds").update({ status, updated_at: new Date().toISOString() }).eq("id", revisionId).eq("status", previous.data.status).select("*").single();
    if (result.error) return json({ error: "Korrekturstatus konnte nicht gespeichert werden" }, { status: 400 });
    await writeAudit(client, profile, "status_change", "project_revision", revisionId, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "publish_project_deliverable") {
    const deliverableId = cleanText(body.deliverableId, 80);
    const destination = ["library", "archive", "campaign"].includes(String(body.destination)) ? String(body.destination) : "library";
    const campaignId = cleanText(body.campaignId, 80);
    if (!deliverableId || (destination === "campaign" && !campaignId)) return json({ error: "Entwurf oder Ziel fehlt" }, { status: 400 });
    const deliverable = await client.from("project_deliverables").select("*").eq("id", deliverableId).in("status", ["approved", "delivered"]).maybeSingle();
    if (!deliverable.data) return json({ error: "Nur freigegebene Entwürfe können übernommen werden" }, { status: 409 });
    const version = await client.from("project_deliverable_versions").select("*").eq("deliverable_id", deliverableId).eq("version", deliverable.data.current_version).eq("upload_state", "ready").maybeSingle();
    if (!version.data || !["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"].includes(version.data.mime_type)) return json({ error: "Nur freigegebene Bilder oder Videos können als Bildschirmmedium übernommen werden" }, { status: 409 });
    if (destination === "campaign") {
      const campaign = await client.from("tenant_campaigns").select("id").eq("id", campaignId).eq("tenant_id", deliverable.data.tenant_id).maybeSingle();
      if (!campaign.data) return json({ error: "Zielkampagne nicht gefunden" }, { status: 404 });
    }
    const content = await client.from("tenant_content").insert({ tenant_id: deliverable.data.tenant_id, title: deliverable.data.title, content_type: version.data.mime_type.startsWith("video/") ? "video" : "image", status: destination === "archive" ? "archived" : "approved", asset_path: version.data.storage_path, payload: { uploadState: "ready", source: "project_deliverable", projectId: deliverable.data.project_id, deliverableId, version: version.data.version, mimeType: version.data.mime_type }, created_by: profile.userId, updated_by: profile.userId }).select("id").single();
    if (content.error) return json({ error: "Medium konnte nicht übernommen werden" }, { status: 400 });
    if (destination === "campaign") {
      const existingLinks = await client.from("tenant_campaign_content").select("position").eq("campaign_id", campaignId).order("position", { ascending: false }).limit(1);
      const position = Number(existingLinks.data?.[0]?.position || -1) + 1;
      await client.from("tenant_campaign_content").insert({ campaign_id: campaignId, content_id: content.data.id, position, duration_seconds: 10 });
      const targets = await client.from("tenant_campaign_displays").select("display_id").eq("campaign_id", campaignId);
      if (targets.data?.length) await client.from("tenant_campaign_display_content").insert(targets.data.map((target) => ({ tenant_id: deliverable.data.tenant_id, campaign_id: campaignId, display_id: target.display_id, content_id: content.data.id, position, duration_seconds: 10 })));
      await bumpDisplayConfigurations(client, (targets.data ?? []).map((target) => target.display_id));
    }
    await client.from("project_deliverables").update({ status: destination === "archive" ? "archived" : "published", updated_at: new Date().toISOString() }).eq("id", deliverableId);
    await writeAudit(client, profile, "publish", "project_deliverable", deliverableId, deliverable.data, { contentId: content.data.id, destination, campaignId: campaignId || null });
    return json({ ok: true, contentId: content.data.id });
  }

  if (action === "project_file_url") {
    const versionId = cleanText(body.versionId, 80);
    if (!versionId) return json({ error: "Dateiversion fehlt" }, { status: 400 });
    const version = await client.from("project_deliverable_versions").select("id,storage_path,file_name,upload_state").eq("id", versionId).eq("upload_state", "ready").maybeSingle();
    if (!version.data) return json({ error: "Datei nicht gefunden" }, { status: 404 });
    const signed = await client.storage.from(PORTAL_MEDIA_BUCKET).createSignedUrl(version.data.storage_path, 10 * 60, { download: version.data.file_name });
    if (signed.error || !signed.data?.signedUrl) return json({ error: "Datei konnte nicht geöffnet werden" }, { status: 503 });
    await writeAudit(client, profile, "document_opened", "project_version", versionId, undefined, { fileName: version.data.file_name });
    return json({ ok: true, url: signed.data.signedUrl });
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
      await sendCustomerStatusNotification(
        client,
        project.data.client_id,
        `Zahlung bestätigt: ${project.data.title}`,
        `${config.label} bestätigt`,
        `Wir haben die ${config.label} für den Auftrag „${project.data.title}“ verbucht. Der Zahlungsstatus und der nächste Projektschritt sind im Kundenportal aktualisiert.`,
      );
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
  if (search.get("portalDocument")) return handlePortalDocument(request);
  if (search.get("portalProjectFile")) return handlePortalProjectFile(request);
  return json({ error: "Nicht gefunden" }, { status: 404 });
}
