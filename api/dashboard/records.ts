import { authorizeDashboard, authorizePortal, dashboardSupabase, isResponse, writeAudit, type PortalProfile } from "../_lib/dashboard/auth.js";
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
import { recordOperationalDelivery, reportOperationalIncident } from "../_lib/dashboard/operations.js";
import { processSupportWithAi } from "../_lib/support/ai.js";
import { handleSupportKnowledgeAction, isSupportKnowledgeAction } from "../_lib/support/knowledge.js";

export const config = { runtime: "nodejs", maxDuration: 180 };

type Payload = Record<string, unknown>;

const PORTAL_MEDIA_BUCKET = "swisscompact-media";
const PORTAL_EXPORT_BUCKET = "swisscompact-exports";
const SUPPORT_ATTACHMENT_BUCKET = "swisscompact-support";
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
const SUPPORT_ATTACHMENT_TYPES: Record<string, { extension: string; maxBytes: number; kind: "image" | "document" }> = {
  "image/jpeg": { extension: "jpg", maxBytes: 10 * 1024 * 1024, kind: "image" },
  "image/png": { extension: "png", maxBytes: 10 * 1024 * 1024, kind: "image" },
  "image/webp": { extension: "webp", maxBytes: 10 * 1024 * 1024, kind: "image" },
  "application/pdf": { extension: "pdf", maxBytes: 10 * 1024 * 1024, kind: "document" },
};

async function storedObject(client: any, bucket: string, path: string): Promise<any | null> {
  const parts = path.split("/");
  const filename = parts.pop() || "";
  const directory = parts.join("/");
  if (!filename || !directory) return null;
  const stored = await client.storage.from(bucket).list(directory, { limit: 10, search: filename });
  if (stored.error) return null;
  return stored.data?.find((entry: any) => entry.name === filename) ?? null;
}

async function prepareSupportAttachment(client: any, values: {
  tenantId: string; ticketId: string; uploadedBy: string; uploadedByType: "customer" | "support";
  fileName: string; mimeType: string; sizeBytes: number; aiAnalysisAllowed: boolean;
}): Promise<{ attachment: any; upload: { signedUrl: string; path: string } } | { error: string; status: number }> {
  const fileConfig = SUPPORT_ATTACHMENT_TYPES[values.mimeType];
  if (!values.fileName || !fileConfig || values.sizeBytes < 1 || values.sizeBytes > fileConfig.maxBytes) {
    return { error: "Unterstützt werden JPG, PNG, WebP und PDF bis 10 MB.", status: 400 };
  }
  const existing = await client.from("support_ticket_attachments").select("id", { count: "exact", head: true }).eq("ticket_id", values.ticketId).neq("upload_status", "failed");
  if (existing.error) return { error: "Support-Anhänge sind noch nicht eingerichtet.", status: 503 };
  if (Number(existing.count || 0) >= 30) return { error: "Dieses Ticket enthält bereits 30 Anhänge. Bitte erstellen Sie bei Bedarf eine neue Supportanfrage.", status: 409 };
  const storagePath = `${values.tenantId}/tickets/${values.ticketId}/${randomBytes(18).toString("hex")}.${fileConfig.extension}`;
  const created = await client.from("support_ticket_attachments").insert({
    tenant_id: values.tenantId,
    ticket_id: values.ticketId,
    uploaded_by: values.uploadedBy,
    uploaded_by_type: values.uploadedByType,
    file_name: values.fileName,
    mime_type: values.mimeType,
    size_bytes: values.sizeBytes,
    storage_path: storagePath,
    upload_status: "uploading",
    visible_to_customer: true,
    ai_analysis_allowed: values.uploadedByType === "customer" && fileConfig.kind === "image" && values.aiAnalysisAllowed,
  }).select("id,ticket_id,file_name,mime_type,size_bytes,upload_status,ai_analysis_allowed,created_at").single();
  if (created.error) return { error: "Der Dateiupload konnte nicht vorbereitet werden.", status: 409 };
  const signed = await client.storage.from(SUPPORT_ATTACHMENT_BUCKET).createSignedUploadUrl(storagePath);
  if (signed.error || !signed.data?.signedUrl) {
    await client.from("support_ticket_attachments").update({ upload_status: "failed" }).eq("id", created.data.id);
    return { error: "Der sichere Dateiupload ist momentan nicht verfügbar.", status: 503 };
  }
  return { attachment: created.data, upload: { signedUrl: signed.data.signedUrl, path: signed.data.path } };
}

async function finalizeSupportAttachment(client: any, attachment: any): Promise<{ attachment: any } | { error: string; status: number }> {
  const object = await storedObject(client, SUPPORT_ATTACHMENT_BUCKET, attachment.storage_path);
  if (!object) return { error: "Die Datei wurde noch nicht vollständig übertragen.", status: 409 };
  const actualSize = Math.max(0, Math.floor(Number(object.metadata?.size) || Number(attachment.size_bytes) || 0));
  const storedMime = cleanText(object.metadata?.mimetype, 100).toLowerCase();
  if (actualSize < 1 || actualSize > 10 * 1024 * 1024 || (storedMime && !SUPPORT_ATTACHMENT_TYPES[storedMime])) {
    await Promise.all([
      client.storage.from(SUPPORT_ATTACHMENT_BUCKET).remove([attachment.storage_path]),
      client.from("support_ticket_attachments").update({ upload_status: "failed" }).eq("id", attachment.id),
    ]);
    return { error: "Die übertragene Datei entspricht nicht dem erlaubten Format oder Grössenlimit.", status: 409 };
  }
  const readyAt = new Date().toISOString();
  const finalized = await client.from("support_ticket_attachments").update({
    upload_status: "ready",
    size_bytes: actualSize,
    ready_at: readyAt,
    updated_at: readyAt,
  }).eq("id", attachment.id).eq("upload_status", "uploading").select("id,ticket_id,message_id,file_name,mime_type,size_bytes,upload_status,ai_analysis_allowed,ready_at,created_at").maybeSingle();
  if (finalized.error || !finalized.data) return { error: "Die Datei wurde übertragen, konnte aber nicht abgeschlossen werden.", status: 409 };
  return { attachment: finalized.data };
}

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
  const operations = dashboardSupabase();
  try {
    const mail = await new Resend(resendKey).emails.send({
      from: "SwissCompact Portal <kontakt@swisscompact.com>",
      to: email,
      replyTo: "kontakt@swisscompact.com",
      subject: `Ihr SwissCompact Portal für ${companyName}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#18181b"><p style="color:#c8102e;font-weight:800;letter-spacing:.12em">SWISSCOMPACT</p><h1 style="font-size:30px">Ihr Kundenportal ist bereit.</h1><p>Guten Tag ${escapeHtml(displayName)},</p><p>SwissCompact hat den geschützten Portal-Arbeitsbereich für <strong>${escapeHtml(companyName)}</strong> vorbereitet.</p><p style="margin:30px 0"><a href="${escapeHtml(invitationUrl)}" style="display:inline-block;padding:15px 22px;background:#d70b31;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Zugang bestätigen und Passwort festlegen</a></p><p style="font-size:13px;color:#666">Dieser Link ist persönlich. Leiten Sie ihn bitte nicht weiter.</p><p>Freundliche Grüsse<br>Marcel Spahr und Thomas Peter<br>SwissCompact</p></div>`,
    });
    if (mail.error) throw new Error(mail.error.message);
    if (operations) await recordOperationalDelivery(operations, { channel: "email", eventType: "portal_invitation", recipient: email, providerReference: mail.data?.id || null, status: "delivered" });
    return true;
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Einladungs-E-Mail fehlgeschlagen";
    if (operations) await Promise.all([
      recordOperationalDelivery(operations, { channel: "email", eventType: "portal_invitation", recipient: email, status: "failed", error: message }),
      reportOperationalIncident(operations, { key: `email:portal_invitation:${email.toLowerCase()}`, source: "email", kind: "delivery_failed", severity: "warning", title: "Portal-Einladung konnte nicht zugestellt werden", message }),
    ]);
    throw new Error(`Einladungs-E-Mail konnte nicht gesendet werden: ${message}`);
  }
}

async function sendCustomerStatusNotification(
  client: any,
  clientId: string | null | undefined,
  subject: string,
  heading: string,
  message: string,
): Promise<boolean> {
  if (!clientId || !process.env.RESEND_API_KEY) return false;
  const customer = await client.from("clients").select("company_name,contact_name,email,tenant:tenants(id)").eq("id", clientId).maybeSingle();
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
    const operations = dashboardSupabase();
    const tenant = relatedRecord(customer.data.tenant);
    if (operations) await recordOperationalDelivery(operations, { tenantId: tenant?.id || null, channel: "email", eventType: "customer_status", entityType: "client", entityId: clientId, recipient: customer.data.email, providerReference: mail.data?.id || null, status: "delivered", metadata: { subject } });
    return true;
  } catch (reason) {
    console.error("Customer status notification failed", reason);
    const operations = dashboardSupabase();
    const tenant = relatedRecord(customer.data.tenant);
    const messageText = reason instanceof Error ? reason.message : "Status-E-Mail fehlgeschlagen";
    if (operations) await Promise.all([
      recordOperationalDelivery(operations, { tenantId: tenant?.id || null, channel: "email", eventType: "customer_status", entityType: "client", entityId: clientId, recipient: customer.data.email, status: "failed", error: messageText, metadata: { subject } }),
      reportOperationalIncident(operations, { key: `email:customer_status:${clientId}`, tenantId: tenant?.id || null, source: "email", kind: "delivery_failed", severity: "warning", title: "Kundeninformation konnte nicht zugestellt werden", message: messageText }),
    ]);
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

type DataRightsRequestType = "personal_export" | "tenant_export" | "membership_deletion" | "tenant_deletion";

async function requiredExportRows(query: PromiseLike<any>, label: string): Promise<unknown> {
  const result = await query;
  if (result.error) throw new Error(`${label} konnten nicht exportiert werden`);
  return result.data ?? [];
}

async function buildPortalDataExport(admin: any, profile: PortalProfile, requestType: "personal_export" | "tenant_export"): Promise<Record<string, unknown>> {
  const generatedAt = new Date().toISOString();
  const common = {
    exportFormat: "swisscompact-data-export-v1",
    requestType,
    generatedAt,
    portal: { id: profile.tenantId, name: profile.tenantName, slug: profile.tenantSlug },
    requester: { userId: profile.userId, membershipId: profile.membershipId, name: profile.displayName, email: profile.email, role: profile.role },
  };
  if (requestType === "personal_export") {
    const [membership, auditEvents, legalAcceptances, dataRightsRequests, supportTickets, supportMessages, supportAttachments, supportFeedback] = await Promise.all([
      requiredExportRows(admin.from("tenant_memberships").select("id,tenant_id,user_id,role,display_name,active,access_status,invited_at,accepted_at,verified_at,revoked_at,created_at,updated_at").eq("id", profile.membershipId).eq("tenant_id", profile.tenantId), "Portalzugang"),
      requiredExportRows(admin.from("tenant_audit_log").select("id,action,entity_type,entity_id,metadata,created_at").eq("tenant_id", profile.tenantId).eq("actor_user_id", profile.userId).order("created_at", { ascending: false }).limit(10_000), "Aktivitätsprotokoll"),
      requiredExportRows(admin.from("legal_acceptances").select("id,document_id,document_type_snapshot,acceptance_scope_snapshot,version_snapshot,title_snapshot,content_hash_snapshot,accepted_at,request_metadata").eq("tenant_id", profile.tenantId).eq("user_id", profile.userId).order("accepted_at", { ascending: false }), "Zustimmungsnachweise"),
      requiredExportRows(admin.from("tenant_data_rights_requests").select("id,request_type,status,reason,retention_resolution,review_note,reviewed_at,completed_at,cancelled_at,created_at,updated_at").eq("tenant_id", profile.tenantId).eq("requested_by", profile.userId).order("created_at", { ascending: false }), "Datenschutzanfragen"),
      requiredExportRows(admin.from("support_tickets").select("id,ticket_number,category,priority,status,title,description,first_response_due_at,first_responded_at,resolved_at,closed_at,created_at,updated_at").eq("tenant_id", profile.tenantId).eq("requested_by", profile.userId).order("created_at"), "Eigene Supportanfragen"),
      requiredExportRows(admin.from("support_ticket_messages").select("id,ticket_id,author_type,author_name,body,visible_to_customer,created_at").eq("tenant_id", profile.tenantId).eq("author_user_id", profile.userId).order("created_at"), "Eigene Supportnachrichten"),
      requiredExportRows(admin.from("support_ticket_attachments").select("id,ticket_id,message_id,file_name,mime_type,size_bytes,upload_status,ai_analysis_allowed,ready_at,created_at").eq("tenant_id", profile.tenantId).eq("uploaded_by", profile.userId).order("created_at"), "Eigene Supportanhänge"),
      requiredExportRows(admin.from("support_ai_feedback").select("id,ticket_id,message_id,rating,comment,created_at,updated_at").eq("tenant_id", profile.tenantId).eq("submitted_by", profile.userId).order("created_at"), "Eigenes Supportfeedback"),
    ]);
    return { ...common, data: { membership, auditEvents, legalAcceptances, dataRightsRequests, supportTickets, supportMessages, supportAttachments, supportFeedback } };
  }

  const campaignReferences = await requiredExportRows(admin.from("tenant_campaigns").select("id").eq("tenant_id", profile.tenantId), "Kampagnenbezüge") as Array<{ id: string }>;
  const campaignIds = campaignReferences.map((item) => item.id);
  const emptyResult = Promise.resolve({ data: [], error: null });
  const [tenant, sites, areas, displays, content, campaigns, campaignContent, campaignDisplays, targetContent, memberships, subscription, auditEvents, legalAcceptances, dataRightsRequests, quotes, projects, invoices, supportTickets, supportMessages, supportAttachments, supportFeedback] = await Promise.all([
    requiredExportRows(admin.from("tenants").select("id,client_id,name,slug,status,branding,enabled_modules,created_at,updated_at").eq("id", profile.tenantId), "Kundenportal"),
    requiredExportRows(admin.from("tenant_sites").select("*").eq("tenant_id", profile.tenantId).order("created_at"), "Standorte"),
    requiredExportRows(admin.from("tenant_areas").select("*").eq("tenant_id", profile.tenantId).order("created_at"), "Bereiche"),
    requiredExportRows(admin.from("tenant_displays").select("id,tenant_id,site_id,area_id,name,kind,status,orientation,resolution,screen_size_inches,panel_technology,use_category,configuration_version,last_seen_at,created_at,updated_at").eq("tenant_id", profile.tenantId).order("created_at"), "Bildschirme"),
    requiredExportRows(admin.from("tenant_content").select("id,tenant_id,title,content_type,status,payload,asset_path,created_by,created_at,updated_at").eq("tenant_id", profile.tenantId).order("created_at"), "Inhalte"),
    requiredExportRows(admin.from("tenant_campaigns").select("*").eq("tenant_id", profile.tenantId).order("created_at"), "Kampagnen"),
    requiredExportRows(campaignIds.length ? admin.from("tenant_campaign_content").select("campaign_id,content_id,position,duration_seconds").in("campaign_id", campaignIds) : emptyResult, "Kampagneninhalte"),
    requiredExportRows(campaignIds.length ? admin.from("tenant_campaign_displays").select("campaign_id,display_id").in("campaign_id", campaignIds) : emptyResult, "Kampagnenbildschirme"),
    requiredExportRows(admin.from("tenant_campaign_display_content").select("campaign_id,display_id,content_id,position,duration_seconds").eq("tenant_id", profile.tenantId), "Ziel-Playlists"),
    requiredExportRows(admin.from("tenant_memberships").select("id,user_id,role,display_name,active,access_status,invited_at,accepted_at,verified_at,revoked_at,created_at,updated_at").eq("tenant_id", profile.tenantId).order("created_at"), "Portalzugänge"),
    requiredExportRows(admin.from("tenant_subscriptions").select("package_code,status,starts_on,minimum_ends_on,monthly_amount_chf,included_ai_credits,created_at,updated_at").eq("tenant_id", profile.tenantId), "Abonnement"),
    requiredExportRows(admin.from("tenant_audit_log").select("id,actor_user_id,action,entity_type,entity_id,metadata,created_at").eq("tenant_id", profile.tenantId).order("created_at", { ascending: false }).limit(10_000), "Aktivitätsprotokoll"),
    requiredExportRows(admin.from("legal_acceptances").select("id,document_id,membership_id,user_id,document_type_snapshot,acceptance_scope_snapshot,version_snapshot,title_snapshot,content_hash_snapshot,accepted_at,request_metadata").eq("tenant_id", profile.tenantId).order("accepted_at", { ascending: false }), "Zustimmungsnachweise"),
    requiredExportRows(admin.from("tenant_data_rights_requests").select("id,membership_id,requested_by,request_type,status,reason,retention_resolution,review_note,reviewed_at,completed_at,cancelled_at,created_at,updated_at").eq("tenant_id", profile.tenantId).order("created_at", { ascending: false }), "Datenschutzanfragen"),
    requiredExportRows(admin.from("quotes").select("id,quote_number,status,currency,total,valid_until,items,terms,document_hash,accepted_by_name,accepted_at,created_at,updated_at").eq("client_id", profile.clientId).order("created_at"), "Offerten"),
    requiredExportRows(admin.from("projects").select("id,quote_id,opportunity_id,order_number,title,status,starts_on,target_completion,deposit_received,installation_payment_received,final_payment_received,created_at,updated_at").eq("client_id", profile.clientId).order("created_at"), "Aufträge"),
    requiredExportRows(admin.from("invoices").select("id,quote_id,project_id,invoice_number,installment,status,amount,currency,issued_on,due_on,paid_at,document_hash,created_at,updated_at").eq("client_id", profile.clientId).order("created_at"), "Rechnungen"),
    requiredExportRows(admin.from("support_tickets").select("id,ticket_number,requested_by,affected_display_id,category,priority,status,title,description,package_code_snapshot,support_label_snapshot,coverage_snapshot,response_target_minutes,first_response_due_at,first_responded_at,resolved_at,closed_at,created_at,updated_at").eq("tenant_id", profile.tenantId).order("created_at"), "Supportanfragen"),
    requiredExportRows(admin.from("support_ticket_messages").select("id,ticket_id,author_user_id,author_type,author_name,body,visible_to_customer,created_at").eq("tenant_id", profile.tenantId).order("created_at"), "Supportnachrichten"),
    requiredExportRows(admin.from("support_ticket_attachments").select("id,ticket_id,message_id,uploaded_by,uploaded_by_type,file_name,mime_type,size_bytes,upload_status,visible_to_customer,ai_analysis_allowed,ready_at,created_at").eq("tenant_id", profile.tenantId).order("created_at"), "Supportanhänge"),
    requiredExportRows(admin.from("support_ai_feedback").select("id,ticket_id,message_id,submitted_by,rating,comment,created_at,updated_at").eq("tenant_id", profile.tenantId).order("created_at"), "Supportfeedback"),
  ]);
  return { ...common, data: { tenant, sites, areas, displays, content, campaigns, campaignContent, campaignDisplays, targetContent, memberships, subscription, auditEvents, legalAcceptances, dataRightsRequests, quotes, projects, invoices, supportTickets, supportMessages, supportAttachments, supportFeedback } };
}

function triggerJsonDownload(url: string, fileName: string): Record<string, unknown> {
  return { url, fileName, expiresIn: 15 * 60 };
}

async function handlePortalRecords(request: Request): Promise<Response> {
  const authorized = await authorizePortal(request);
  if (isResponse(authorized)) return authorized;
  const { client, profile } = authorized;
  const body = await request.json() as Payload;
  const action = cleanText(body.action, 80);
  const now = new Date().toISOString();

  if (action === "mark_notification_section_read") {
    const section = cleanText(body.section, 40);
    const marked = await client.rpc("mark_notification_section_read", {
      target_audience: "portal",
      target_scope: profile.tenantId,
      target_section: section,
      target_read_through: cleanText(body.readThrough, 80) || null,
    });
    if (marked.error) return json({ error: marked.error.message || "Lesestatus konnte nicht gespeichert werden" }, { status: 409 });
    return json({ ok: true, readAt: marked.data });
  }

  if (action === "accept_legal_documents") {
    const documentIds = Array.isArray(body.documentIds)
      ? [...new Set(body.documentIds.map((value) => cleanText(value, 80)).filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)))].slice(0, 10)
      : [];
    if (!documentIds.length) return json({ error: "Wählen Sie mindestens ein gültiges Dokument" }, { status: 400 });
    const accepted = await client.rpc("accept_legal_documents", {
      target_tenant: profile.tenantId,
      target_documents: documentIds,
      acceptance_metadata: {
        language: (request.headers.get("accept-language") || "de-CH").slice(0, 80),
      },
    });
    if (accepted.error) return json({ error: accepted.error.message || "Zustimmung konnte nicht protokolliert werden" }, { status: 409 });
    return json({ ok: true, accepted: Number(accepted.data || 0) });
  }

  if (action === "create_data_rights_request") {
    const requestType = cleanText(body.requestType, 40) as DataRightsRequestType;
    if (!["personal_export", "tenant_export", "membership_deletion", "tenant_deletion"].includes(requestType)) return json({ error: "Ungültige Datenschutzanfrage" }, { status: 400 });
    const created = await client.rpc("create_data_rights_request", {
      target_tenant: profile.tenantId,
      target_request_type: requestType,
      request_reason: cleanText(body.reason, 2000) || null,
    });
    if (created.error || !created.data) return json({ error: created.error?.message || "Datenschutzanfrage konnte nicht erstellt werden" }, { status: 409 });
    const requestId = String(created.data);
    const admin = dashboardSupabase();
    if (!admin) return json({ error: "Datenschutzservice ist noch nicht konfiguriert" }, { status: 503 });
    await admin.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "data_rights_request_created", entity_type: "data_rights_request", entity_id: requestId, metadata: { requestType } });
    if (!["personal_export", "tenant_export"].includes(requestType)) return json({ ok: true, requestId });

    const processing = await admin.from("tenant_data_rights_requests").update({ status: "processing" }).eq("id", requestId).eq("tenant_id", profile.tenantId).in("status", ["submitted", "approved"]).select("id").maybeSingle();
    if (processing.error || !processing.data) return json({ error: "Der Datenexport wird bereits bearbeitet" }, { status: 409 });
    try {
      const exportData = await buildPortalDataExport(admin, profile, requestType as "personal_export" | "tenant_export");
      const serialized = JSON.stringify(exportData, null, 2);
      if (Buffer.byteLength(serialized, "utf8") > 10 * 1024 * 1024) throw new Error("Der Export überschreitet die sichere Dateigrösse");
      const exportPath = `${profile.tenantId}/${requestId}.json`;
      const upload = await admin.storage.from(PORTAL_EXPORT_BUCKET).upload(exportPath, serialized, { contentType: "application/json", upsert: true });
      if (upload.error) throw new Error("Die Exportdatei konnte nicht sicher gespeichert werden");
      const exportExpiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
      const completed = await admin.from("tenant_data_rights_requests").update({ status: "completed", export_path: exportPath, export_expires_at: exportExpiresAt, completed_at: new Date().toISOString() }).eq("id", requestId).eq("tenant_id", profile.tenantId);
      if (completed.error) throw new Error("Der Export konnte nicht abgeschlossen werden");
      const fileName = `${profile.tenantSlug}-${requestType === "personal_export" ? "meine-daten" : "portal-daten"}.json`;
      const signed = await admin.storage.from(PORTAL_EXPORT_BUCKET).createSignedUrl(exportPath, 15 * 60, { download: fileName });
      if (signed.error || !signed.data?.signedUrl) throw new Error("Der Download-Link konnte nicht erstellt werden");
      await admin.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "data_export_completed", entity_type: "data_rights_request", entity_id: requestId, metadata: { requestType, exportExpiresAt } });
      await recordOperationalDelivery(admin, { tenantId: profile.tenantId, channel: "export", eventType: "data_export_created", entityType: "data_rights_request", entityId: requestId, status: "delivered", metadata: { requestType } });
      return json({ ok: true, requestId, exportExpiresAt, download: triggerJsonDownload(signed.data.signedUrl, fileName) });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Datenexport konnte nicht erstellt werden";
      await admin.from("tenant_data_rights_requests").update({ status: "rejected", review_note: "Der automatische Export konnte technisch nicht erstellt werden. Bitte erneut anfordern." }).eq("id", requestId).eq("tenant_id", profile.tenantId);
      await Promise.all([
        recordOperationalDelivery(admin, { tenantId: profile.tenantId, channel: "export", eventType: "data_export_created", entityType: "data_rights_request", entityId: requestId, status: "failed", error: message, metadata: { requestType } }),
        reportOperationalIncident(admin, { key: `export:${requestId}`, tenantId: profile.tenantId, source: "storage", kind: "export_failed", severity: "warning", title: "Datenexport konnte nicht erstellt werden", message, metadata: { requestType } }),
      ]);
      return json({ error: message }, { status: 503 });
    }
  }

  if (action === "open_data_export") {
    const requestId = cleanText(body.requestId, 80);
    const record = await client.from("tenant_data_rights_requests").select("id,request_type,status,export_path,export_expires_at,requested_by").eq("id", requestId).eq("tenant_id", profile.tenantId).eq("status", "completed").maybeSingle();
    if (!record.data?.export_path || !record.data.export_expires_at || new Date(record.data.export_expires_at).getTime() <= Date.now()) return json({ error: "Dieser Export ist nicht mehr verfügbar. Erstellen Sie bitte einen neuen." }, { status: 410 });
    if (record.data.request_type === "personal_export" && record.data.requested_by !== profile.userId) return json({ error: "Kein Zugriff auf diesen persönlichen Export" }, { status: 403 });
    const admin = dashboardSupabase();
    if (!admin) return json({ error: "Datenschutzservice ist noch nicht konfiguriert" }, { status: 503 });
    const fileName = `${profile.tenantSlug}-${record.data.request_type === "personal_export" ? "meine-daten" : "portal-daten"}.json`;
    const signed = await admin.storage.from(PORTAL_EXPORT_BUCKET).createSignedUrl(record.data.export_path, 15 * 60, { download: fileName });
    if (signed.error || !signed.data?.signedUrl) return json({ error: "Download-Link konnte nicht erstellt werden" }, { status: 503 });
    await admin.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "data_export_opened", entity_type: "data_rights_request", entity_id: requestId, metadata: { requestType: record.data.request_type } });
    await recordOperationalDelivery(admin, { tenantId: profile.tenantId, channel: "export", eventType: "data_export_download", entityType: "data_rights_request", entityId: requestId, status: "delivered", metadata: { requestType: record.data.request_type } });
    return json({ ok: true, download: triggerJsonDownload(signed.data.signedUrl, fileName) });
  }

  if (action === "cancel_data_rights_request") {
    const requestId = cleanText(body.requestId, 80);
    const cancelled = await client.rpc("cancel_data_rights_request", { target_request: requestId });
    if (cancelled.error) return json({ error: cancelled.error.message || "Anfrage konnte nicht zurückgezogen werden" }, { status: 409 });
    const admin = dashboardSupabase();
    await admin?.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "data_rights_request_cancelled", entity_type: "data_rights_request", entity_id: requestId });
    return json({ ok: true });
  }

  if (action === "create_support_ticket") {
    const category = cleanText(body.category, 40);
    const priority = cleanText(body.priority, 20);
    const title = cleanText(body.title, 180);
    const description = cleanText(body.description, 8000);
    const displayId = cleanText(body.displayId, 80) || null;
    const created = await client.rpc("create_support_ticket", {
      target_tenant: profile.tenantId,
      target_category: category,
      target_priority: priority,
      target_title: title,
      target_description: description,
      target_display: displayId,
    });
    if (created.error || !created.data) return json({ error: created.error?.message || "Supportanfrage konnte nicht erstellt werden" }, { status: 400 });
    const ticketId = String(created.data);
    const ticket = await client.from("support_tickets").select("id,ticket_number,first_response_due_at,support_label_snapshot,ai_handling_status").eq("id", ticketId).eq("tenant_id", profile.tenantId).single();
    const admin = dashboardSupabase();
    const deferAi = body.deferAi === true && ticket.data?.ai_handling_status === "eligible";
    const aiResult = admin && !deferAi
      ? await processSupportWithAi(admin, ticketId)
      : { notifyAdmin: !admin };
    if (admin && aiResult.notifyAdmin && process.env.RESEND_API_KEY) {
      try {
        const mail = await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: "SwissCompact Portal <kontakt@swisscompact.com>",
          to: "kontakt@swisscompact.com",
          replyTo: profile.email,
          subject: `${priority === "critical" ? "KRITISCH · " : ""}Support ${ticket.data?.ticket_number || ""}: ${title}`,
          html: `<h2>Neue Supportanfrage</h2><p><strong>Kundenportal:</strong> ${escapeHtml(profile.tenantName)}<br><strong>Kontakt:</strong> ${escapeHtml(profile.displayName)} (${escapeHtml(profile.email)})<br><strong>Priorität:</strong> ${escapeHtml(priority)}<br><strong>Kategorie:</strong> ${escapeHtml(category)}</p><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description).replace(/\n/g, "<br>")}</p>`,
        });
        await recordOperationalDelivery(admin, { tenantId: profile.tenantId, channel: "email", eventType: "support_ticket_created", entityType: "support_ticket", entityId: ticketId, recipient: "kontakt@swisscompact.com", providerReference: mail.data?.id || null, status: mail.error ? "failed" : "delivered", error: mail.error?.message || null });
      } catch (reason) {
        await recordOperationalDelivery(admin, { tenantId: profile.tenantId, channel: "email", eventType: "support_ticket_created", entityType: "support_ticket", entityId: ticketId, recipient: "kontakt@swisscompact.com", status: "failed", error: reason instanceof Error ? reason.message : "Supportbenachrichtigung fehlgeschlagen" });
      }
    }
    return json({ ok: true, ticket: ticket.data ?? { id: ticketId } });
  }

  if (action === "prepare_support_attachment") {
    const admin = dashboardSupabase();
    const ticketId = cleanText(body.ticketId, 80);
    const fileName = safeFileName(body.fileName);
    const mimeType = cleanText(body.mimeType, 100).toLowerCase();
    const sizeBytes = Math.max(0, Math.floor(Number(body.sizeBytes) || 0));
    if (!admin || !ticketId) return json({ error: "Supportticket oder Dateispeicher fehlt." }, { status: 400 });
    const ticket = await admin.from("support_tickets").select("id,status").eq("id", ticketId).eq("tenant_id", profile.tenantId).maybeSingle();
    if (!ticket.data) return json({ error: "Supportanfrage nicht gefunden." }, { status: 404 });
    if (["closed", "cancelled"].includes(ticket.data.status)) return json({ error: "Zu diesem abgeschlossenen Ticket können keine Dateien mehr hochgeladen werden." }, { status: 409 });
    const prepared = await prepareSupportAttachment(admin, {
      tenantId: profile.tenantId,
      ticketId,
      uploadedBy: profile.userId,
      uploadedByType: "customer",
      fileName,
      mimeType,
      sizeBytes,
      aiAnalysisAllowed: body.aiAnalysisAllowed === true,
    });
    if ("error" in prepared) return json({ error: prepared.error }, { status: prepared.status });
    return json({ ok: true, ...prepared });
  }

  if (action === "finalize_support_attachment") {
    const admin = dashboardSupabase();
    const attachmentId = cleanText(body.attachmentId, 80);
    if (!admin || !attachmentId) return json({ error: "Supportanhang fehlt." }, { status: 400 });
    const attachment = await admin.from("support_ticket_attachments").select("*").eq("id", attachmentId).eq("tenant_id", profile.tenantId).eq("uploaded_by", profile.userId).maybeSingle();
    if (!attachment.data) return json({ error: "Supportanhang nicht gefunden." }, { status: 404 });
    if (attachment.data.upload_status === "ready") return json({ ok: true, attachment: attachment.data });
    const finalized = await finalizeSupportAttachment(admin, attachment.data);
    if ("error" in finalized) return json({ error: finalized.error }, { status: finalized.status });
    await admin.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "support_attachment_uploaded", entity_type: "support_ticket", entity_id: attachment.data.ticket_id, metadata: { attachmentId, fileName: attachment.data.file_name, aiAnalysisAllowed: attachment.data.ai_analysis_allowed } });
    return json({ ok: true, attachment: finalized.attachment });
  }

  if (action === "process_support_ticket") {
    const admin = dashboardSupabase();
    const ticketId = cleanText(body.ticketId, 80);
    if (!admin || !ticketId) return json({ error: "Supportanfrage fehlt." }, { status: 400 });
    const ticket = await admin.from("support_tickets").select("id,status,ai_handling_status").eq("id", ticketId).eq("tenant_id", profile.tenantId).maybeSingle();
    if (!ticket.data) return json({ error: "Supportanfrage nicht gefunden." }, { status: 404 });
    if (["closed", "cancelled"].includes(ticket.data.status)) return json({ error: "Diese Supportanfrage ist bereits abgeschlossen." }, { status: 409 });
    const latest = await admin.from("support_ticket_attachments").select("ready_at").eq("ticket_id", ticketId).eq("upload_status", "ready").order("ready_at", { ascending: false }).limit(1).maybeSingle();
    const trigger = `attachments:${ticketId}:${latest.data?.ready_at || ticket.data.ai_handling_status}`;
    const result = await processSupportWithAi(admin, ticketId, null, trigger);
    return json({ ok: true, ai: result });
  }

  if (action === "add_support_message") {
    const ticketId = cleanText(body.ticketId, 80);
    const attachmentIds = Array.isArray(body.attachmentIds)
      ? [...new Set(body.attachmentIds.map((entry) => cleanText(entry, 80)).filter(Boolean))].slice(0, 5)
      : [];
    let message = cleanText(body.message, 8000);
    if (!message && attachmentIds.length) message = "Ich habe zusätzliche Dateien zur Supportanfrage hochgeladen.";
    if (!message) return json({ error: "Schreiben Sie eine Nachricht oder wählen Sie mindestens eine Datei aus." }, { status: 400 });
    const admin = dashboardSupabase();
    if (attachmentIds.length) {
      if (!admin) return json({ error: "Dateianhänge sind momentan nicht verfügbar." }, { status: 503 });
      const attachments = await admin.from("support_ticket_attachments").select("id").in("id", attachmentIds).eq("ticket_id", ticketId).eq("tenant_id", profile.tenantId).eq("uploaded_by", profile.userId).eq("upload_status", "ready").is("message_id", null);
      if (attachments.error || attachments.data?.length !== attachmentIds.length) return json({ error: "Mindestens ein Anhang ist noch nicht vollständig hochgeladen." }, { status: 409 });
    }
    const added = await client.rpc("add_customer_support_message", { target_ticket: ticketId, message_body: message });
    if (added.error || !added.data) return json({ error: added.error?.message || "Nachricht konnte nicht gesendet werden" }, { status: 400 });
    if (attachmentIds.length && admin) {
      const linked = await admin.from("support_ticket_attachments").update({ message_id: String(added.data), updated_at: new Date().toISOString() }).in("id", attachmentIds).eq("ticket_id", ticketId).eq("tenant_id", profile.tenantId).eq("uploaded_by", profile.userId).eq("upload_status", "ready").is("message_id", null);
      if (linked.error) return json({ error: "Die Nachricht wurde gespeichert, die Anhänge konnten aber noch nicht zugeordnet werden." }, { status: 409 });
    }
    const ticket = await client.from("support_tickets").select("ticket_number,title").eq("id", ticketId).eq("tenant_id", profile.tenantId).maybeSingle();
    const aiResult = admin
      ? await processSupportWithAi(admin, ticketId, String(added.data))
      : { notifyAdmin: true };
    if (admin && aiResult.notifyAdmin && process.env.RESEND_API_KEY && ticket.data) {
      try {
        const mail = await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: "SwissCompact Portal <kontakt@swisscompact.com>",
          to: "kontakt@swisscompact.com",
          replyTo: profile.email,
          subject: `Kundenantwort · Support ${ticket.data.ticket_number}: ${ticket.data.title}`,
          html: `<h2>Neue Kundenantwort</h2><p><strong>Kundenportal:</strong> ${escapeHtml(profile.tenantName)}<br><strong>Kontakt:</strong> ${escapeHtml(profile.displayName)} (${escapeHtml(profile.email)})</p><h3>${escapeHtml(ticket.data.ticket_number)} · ${escapeHtml(ticket.data.title)}</h3><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
        });
        await recordOperationalDelivery(admin, { tenantId: profile.tenantId, channel: "email", eventType: "support_customer_reply", entityType: "support_ticket", entityId: ticketId, recipient: "kontakt@swisscompact.com", providerReference: mail.data?.id || null, status: mail.error ? "failed" : "delivered", error: mail.error?.message || null });
      } catch (reason) {
        await recordOperationalDelivery(admin, { tenantId: profile.tenantId, channel: "email", eventType: "support_customer_reply", entityType: "support_ticket", entityId: ticketId, recipient: "kontakt@swisscompact.com", status: "failed", error: reason instanceof Error ? reason.message : "Supportantwort-Benachrichtigung fehlgeschlagen" });
      }
    }
    return json({ ok: true, messageId: added.data });
  }

  if (action === "submit_support_ai_feedback") {
    const messageId = cleanText(body.messageId, 80);
    const rating = cleanText(body.rating, 30);
    const comment = cleanText(body.comment, 2000) || null;
    if (!messageId || !["helpful", "not_helpful"].includes(rating)) return json({ error: "Ungültige Bewertung" }, { status: 400 });
    const saved = await client.rpc("submit_support_ai_feedback", {
      target_message: messageId,
      target_rating: rating,
      target_comment: comment,
    });
    if (saved.error || !saved.data) return json({ error: saved.error?.message || "Bewertung konnte nicht gespeichert werden" }, { status: 400 });
    return json({ ok: true, feedbackId: saved.data });
  }

  if (profile.role === "viewer") return json({ error: "Nur Lesezugriff" }, { status: 403 });

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

  if (action === "save_campaign_template") {
    const campaignId = cleanText(body.campaignId, 80);
    const templateName = cleanText(body.name, 180);
    const description = cleanText(body.description, 500) || null;
    if (!campaignId || !templateName) return json({ error: "Kampagne und Vorlagenname sind erforderlich" }, { status: 400 });
    const campaign = await client.from("tenant_campaigns")
      .select("id,name,theme,priority,scope_site_id,scope_area_id,starts_at,ends_at,schedule")
      .eq("id", campaignId).eq("tenant_id", profile.tenantId).maybeSingle();
    if (!campaign.data) return json({ error: "Kampagne nicht gefunden" }, { status: 404 });
    const [displayLinks, targetLinks] = await Promise.all([
      client.from("tenant_campaign_displays").select("display_id").eq("campaign_id", campaignId),
      client.from("tenant_campaign_display_content").select("display_id,content_id,position,duration_seconds").eq("campaign_id", campaignId).eq("tenant_id", profile.tenantId).order("position"),
    ]);
    if (displayLinks.error || targetLinks.error) return json({ error: "Die Kampagnenkonfiguration konnte nicht gelesen werden" }, { status: 503 });
    const displayIds = (displayLinks.data ?? []).map((entry) => entry.display_id);
    const targetAssignments = displayIds.map((displayId) => ({
      displayId,
      contentItems: (targetLinks.data ?? [])
        .filter((entry) => entry.display_id === displayId)
        .sort((left, right) => left.position - right.position)
        .map((entry) => ({ contentId: entry.content_id, durationSeconds: Math.min(3600, Math.max(5, Number(entry.duration_seconds) || 10)) })),
    }));
    if (!displayIds.length || targetAssignments.some((assignment) => !assignment.contentItems.length)) {
      return json({ error: "Nur vollständig eingerichtete Kampagnen können als Vorlage gespeichert werden" }, { status: 409 });
    }
    const configuration = {
      theme: campaign.data.theme || null,
      priority: Number(campaign.data.priority || 50),
      scopeSiteId: campaign.data.scope_site_id || null,
      scopeAreaId: campaign.data.scope_area_id || null,
      defaultDurationDays: campaign.data.ends_at
        ? Math.max(1, Math.ceil((new Date(campaign.data.ends_at).getTime() - new Date(campaign.data.starts_at || now).getTime()) / 86_400_000))
        : null,
      displayIds,
      targetAssignments,
      playlistStrategy: ["shared", "hierarchy", "individual"].includes(campaign.data.schedule?.portalPlaylistStrategy) ? campaign.data.schedule.portalPlaylistStrategy : "shared",
      hierarchyPlaylists: campaign.data.schedule?.portalPlaylistStrategy === "hierarchy" && campaign.data.schedule?.portalHierarchyPlaylists && typeof campaign.data.schedule.portalHierarchyPlaylists === "object" ? campaign.data.schedule.portalHierarchyPlaylists : {},
    };
    const created = await client.from("tenant_campaign_templates").insert({
      tenant_id: profile.tenantId,
      name: templateName,
      description,
      template_kind: "custom",
      configuration,
      source_campaign_id: campaignId,
      created_by: profile.userId,
      updated_at: now,
    }).select("id,name,description,template_kind,configuration,source_campaign_id,created_at,updated_at").single();
    if (created.error) return json({ error: created.error.code === "23505" ? "Eine Vorlage mit diesem Namen besteht bereits" : "Die Vorlage konnte noch nicht gespeichert werden. Führen Sie zuerst die Vorlagen-Migration aus." }, { status: ["42P01", "PGRST205"].includes(created.error.code) ? 503 : 400 });
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "campaign_template_created", entity_type: "campaign_template", entity_id: created.data.id, metadata: { sourceCampaignId: campaignId, displayCount: displayIds.length, contentCount: new Set((targetLinks.data ?? []).map((entry) => entry.content_id)).size } });
    return json({ ok: true, record: created.data });
  }

  if (action === "delete_campaign_template") {
    const id = cleanText(body.id, 80);
    if (!id) return json({ error: "Vorlage fehlt" }, { status: 400 });
    const existing = await client.from("tenant_campaign_templates").select("id,name").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (!existing.data) return json({ error: "Vorlage nicht gefunden" }, { status: 404 });
    const removed = await client.from("tenant_campaign_templates").delete().eq("id", id).eq("tenant_id", profile.tenantId);
    if (removed.error) return json({ error: "Vorlage konnte nicht gelöscht werden" }, { status: 400 });
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "campaign_template_deleted", entity_type: "campaign_template", entity_id: id, metadata: { name: existing.data.name } });
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

  if (action === "save_display_group") {
    const groupId = cleanText(body.id, 80) || null;
    const name = cleanText(body.name, 180);
    const description = cleanText(body.description, 500) || null;
    const displayIds = [...new Set((Array.isArray(body.displayIds) ? body.displayIds : []).map((id) => cleanText(id, 80)).filter(Boolean))];
    if (!name) return json({ error: "Geben Sie einen Gruppennamen ein" }, { status: 400 });
    if (displayIds.length > 500) return json({ error: "Eine Gruppe kann höchstens 500 Bildschirme enthalten" }, { status: 400 });
    if (displayIds.length) {
      const available = await client.from("tenant_displays").select("id").eq("tenant_id", profile.tenantId).in("id", displayIds);
      if (available.error || (available.data ?? []).length !== displayIds.length) return json({ error: "Mindestens ein Bildschirm gehört nicht zu diesem Kundenportal" }, { status: 403 });
    }
    const saved = await client.rpc("save_display_group", {
      target_tenant: profile.tenantId,
      target_group: groupId,
      group_name: name,
      group_description: description,
      target_display_ids: displayIds,
    });
    if (saved.error) {
      const missingMigration = ["42883", "PGRST202"].includes(saved.error.code);
      return json({ error: missingMigration ? "Bildschirmgruppen müssen zuerst in Supabase aktiviert werden" : saved.error.code === "23505" ? "Eine Gruppe mit diesem Namen besteht bereits" : saved.error.message }, { status: missingMigration ? 503 : 400 });
    }
    const id = String(saved.data || groupId || "");
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: groupId ? "display_group_updated" : "display_group_created", entity_type: "display_group", entity_id: id, metadata: { name, displayCount: displayIds.length } });
    return json({ ok: true, id });
  }

  if (action === "delete_display_group") {
    const id = cleanText(body.id, 80);
    if (!id) return json({ error: "Bildschirmgruppe fehlt" }, { status: 400 });
    const existing = await client.from("tenant_display_groups").select("id,name").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (!existing.data) return json({ error: "Bildschirmgruppe nicht gefunden" }, { status: 404 });
    const removed = await client.from("tenant_display_groups").delete().eq("id", id).eq("tenant_id", profile.tenantId);
    if (removed.error) return json({ error: "Bildschirmgruppe konnte nicht gelöscht werden" }, { status: 400 });
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "display_group_deleted", entity_type: "display_group", entity_id: id, metadata: { name: existing.data.name } });
    return json({ ok: true });
  }

  if (action === "bulk_set_display_fallback") {
    const displayIds = [...new Set((Array.isArray(body.displayIds) ? body.displayIds : []).map((id) => cleanText(id, 80)).filter(Boolean))];
    const contentId = cleanText(body.contentId, 80) || null;
    if (!displayIds.length) return json({ error: "Wählen Sie mindestens einen Bildschirm aus" }, { status: 400 });
    if (displayIds.length > 500) return json({ error: "Es können höchstens 500 Bildschirme gleichzeitig geändert werden" }, { status: 400 });
    if (contentId) {
      const content = await client.from("tenant_content").select("id,status").eq("id", contentId).eq("tenant_id", profile.tenantId).in("status", ["approved", "published"]).maybeSingle();
      if (!content.data) return json({ error: "Wählen Sie einen freigegebenen Ersatzinhalt" }, { status: 409 });
    }
    const available = await client.from("tenant_displays").select("id").eq("tenant_id", profile.tenantId).in("id", displayIds);
    if (available.error || (available.data ?? []).length !== displayIds.length) return json({ error: "Mindestens ein Bildschirm gehört nicht zu diesem Kundenportal" }, { status: 403 });
    const updated = await client.from("tenant_displays").update({ fallback_content_id: contentId, updated_at: now }).eq("tenant_id", profile.tenantId).in("id", displayIds).select("id");
    if (updated.error || (updated.data ?? []).length !== displayIds.length) return json({ error: "Die Ersatzinhalte konnten nicht vollständig gespeichert werden" }, { status: 400 });
    await bumpDisplayConfigurations(client, displayIds, "fallback");
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "display_bulk_fallback_changed", entity_type: "display_group", metadata: { displayIds, contentId } });
    return json({ ok: true, count: displayIds.length });
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
    const requestedPlaylistStrategy = cleanText(body.playlistStrategy, 24);
    const playlistStrategy = ["shared", "hierarchy", "individual"].includes(requestedPlaylistStrategy) ? requestedPlaylistStrategy : "shared";
    const rawHierarchyPlaylists = body.hierarchyPlaylists && typeof body.hierarchyPlaylists === "object" && !Array.isArray(body.hierarchyPlaylists) ? body.hierarchyPlaylists as Record<string, unknown> : {};
    if (Object.keys(rawHierarchyPlaylists).length > 250) return json({ error: "Die Playlist-Struktur enthält zu viele Ebenen" }, { status: 400 });
    let hierarchyPlaylists: Record<string, Array<{ contentId: string; durationSeconds: number }>>;
    try {
      hierarchyPlaylists = Object.fromEntries(Object.entries(rawHierarchyPlaylists).map(([rawKey, rawItems]) => {
        const key = cleanText(rawKey, 90);
        if (!/^(all|site:[0-9a-f-]{36}|area:[0-9a-f-]{36})$/i.test(key) || !Array.isArray(rawItems) || rawItems.length > 100) throw new Error("Ungültige hierarchische Playlist");
        const items = rawItems.map((rawItem) => {
          const item = rawItem && typeof rawItem === "object" ? rawItem as Record<string, unknown> : {};
          return { contentId: cleanText(item.contentId, 80), durationSeconds: Math.min(3600, Math.max(5, Math.round(Number(item.durationSeconds) || 10))) };
        }).filter((item) => item.contentId);
        if (new Set(items.map((item) => item.contentId)).size !== items.length) throw new Error("Ein Motiv darf pro Playlist-Ebene nur einmal vorkommen");
        return [key, items];
      }));
    } catch (reason) {
      return json({ error: reason instanceof Error ? reason.message : "Ungültige hierarchische Playlist" }, { status: 400 });
    }
    if (playlistStrategy === "hierarchy" && !hierarchyPlaylists.all?.length) return json({ error: "Legen Sie zuerst eine Standard-Playlist für alle Ziele fest" }, { status: 400 });
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
    const hierarchyContentIds = [...new Set(Object.values(hierarchyPlaylists).flatMap((items) => items.map((item) => item.contentId)))];
    const referencedContentIds = [...new Set([...contentIds, ...hierarchyContentIds])];
    const campaign = await client.from("tenant_campaigns").select("id,status,schedule").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (campaign.error || !campaign.data) return json({ error: "Kampagne nicht gefunden" }, { status: 404 });
    if (referencedContentIds.length) {
      const available = await client.from("tenant_content").select("id,content_type,status,asset_path,payload").eq("tenant_id", profile.tenantId).in("id", referencedContentIds);
      if (available.error || available.data?.length !== referencedContentIds.length) return json({ error: "Mindestens ein Motiv gehört nicht zu diesem Kunden" }, { status: 403 });
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
    if (playlistStrategy === "hierarchy") {
      const hierarchySiteIds = Object.keys(hierarchyPlaylists).filter((key) => key.startsWith("site:")).map((key) => key.slice(5));
      const hierarchyAreaIds = Object.keys(hierarchyPlaylists).filter((key) => key.startsWith("area:")).map((key) => key.slice(5));
      if (hierarchySiteIds.length) {
        const linkedSites = await client.from("tenant_sites").select("id").eq("tenant_id", profile.tenantId).in("id", hierarchySiteIds);
        if (linkedSites.error || (linkedSites.data ?? []).length !== new Set(hierarchySiteIds).size) return json({ error: "Eine Playlist verweist auf einen fremden Standort" }, { status: 403 });
      }
      if (hierarchyAreaIds.length) {
        const linkedAreas = await client.from("tenant_areas").select("id").eq("tenant_id", profile.tenantId).in("id", hierarchyAreaIds);
        if (linkedAreas.error || (linkedAreas.data ?? []).length !== new Set(hierarchyAreaIds).size) return json({ error: "Eine Playlist verweist auf einen fremden Bereich" }, { status: 403 });
      }
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
    const updatedCampaign = await client.from("tenant_campaigns").update({ name, theme, priority, scope_site_id: scopeSiteId, scope_area_id: scopeAreaId, starts_at: startsAt, ends_at: endsAt, schedule: { ...schedule, portalSetupStep: setupStep, portalPlaylistStrategy: playlistStrategy, portalHierarchyPlaylists: playlistStrategy === "hierarchy" ? hierarchyPlaylists : {} }, updated_at: now }).eq("id", id).eq("tenant_id", profile.tenantId);
    if (updatedCampaign.error) return json({ error: "Die Kampagneneinstellungen konnten nicht gespeichert werden" }, { status: 400 });
    if (setupStep === 4) {
      const captured = await client.rpc("capture_campaign_version", { target_campaign: id, version_source: "saved", restored_from: null });
      if (captured.error) {
        if (["42883", "42P01", "PGRST202", "PGRST205"].includes(captured.error.code)) console.warn("portal campaign versions are not migrated yet", captured.error.message);
        else return json({ error: "Die Kampagne wurde gespeichert, der Versionsstand konnte aber nicht gesichert werden" }, { status: 500 });
      }
    }
    await bumpDisplayConfigurations(client, [...(previousTargets.data ?? []).map((entry) => entry.display_id), ...displayIds], "campaign", id);
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "configure", entity_type: "campaign", entity_id: id, metadata: { contentCount: contentIds.length, displayCount: displayIds.length, targetedContentCount: totalContentItems } });
    return json({ ok: true });
  }

  if (action === "restore_campaign_version") {
    const id = cleanText(body.id, 80);
    const versionId = cleanText(body.versionId, 80);
    if (!id || !versionId) return json({ error: "Kampagne und Version sind erforderlich" }, { status: 400 });
    const campaign = await client.from("tenant_campaigns").select("id,name,status").eq("id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (campaign.error || !campaign.data) return json({ error: "Kampagne nicht gefunden" }, { status: 404 });
    if (["active", "scheduled"].includes(campaign.data.status)) return json({ error: "Pausieren Sie die laufende Kampagne vor der Wiederherstellung" }, { status: 409 });
    const version = await client.from("tenant_campaign_versions").select("id,version").eq("id", versionId).eq("campaign_id", id).eq("tenant_id", profile.tenantId).maybeSingle();
    if (version.error) return json({ error: ["42P01", "PGRST205"].includes(version.error.code) ? "Führen Sie zuerst die Kampagnenversions-Migration aus" : "Der Versionsverlauf konnte nicht geprüft werden" }, { status: ["42P01", "PGRST205"].includes(version.error.code) ? 503 : 400 });
    if (!version.data) return json({ error: "Kampagnenversion nicht gefunden" }, { status: 404 });
    const previousTargets = await client.from("tenant_campaign_displays").select("display_id").eq("campaign_id", id);
    const restored = await client.rpc("restore_campaign_version", { target_version: versionId });
    if (restored.error) return json({ error: restored.error.message || "Die Kampagnenversion konnte nicht wiederhergestellt werden" }, { status: 409 });
    const currentTargets = await client.from("tenant_campaign_displays").select("display_id").eq("campaign_id", id);
    const affectedDisplays = [...new Set([...(previousTargets.data ?? []).map((entry) => entry.display_id), ...(currentTargets.data ?? []).map((entry) => entry.display_id)])];
    await bumpDisplayConfigurations(client, affectedDisplays, "campaign", id);
    await client.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "restore_version", entity_type: "campaign", entity_id: id, metadata: { restoredFromVersion: version.data.version, restoredVersionId: restored.data } });
    return json({ ok: true, versionId: restored.data });
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

async function handleSupportAttachment(request: Request, attachmentId: string): Promise<Response> {
  const portalAudience = new URL(request.url).searchParams.get("audience") === "portal";
  const admin = dashboardSupabase();
  if (!admin || !attachmentId) return json({ error: "Supportanhang ist nicht verfügbar." }, { status: 503 });

  let actorUserId = "";
  let attachment: any = null;
  if (portalAudience) {
    const authorized = await authorizePortal(request);
    if (isResponse(authorized)) return authorized;
    actorUserId = authorized.profile.userId;
    const result = await admin.from("support_ticket_attachments").select("id,tenant_id,ticket_id,file_name,mime_type,storage_path,visible_to_customer,upload_status").eq("id", attachmentId).eq("tenant_id", authorized.profile.tenantId).eq("visible_to_customer", true).eq("upload_status", "ready").maybeSingle();
    attachment = result.data;
  } else {
    const authorized = await authorizeDashboard(request);
    if (isResponse(authorized)) return authorized;
    actorUserId = authorized.profile.userId;
    const result = await admin.from("support_ticket_attachments").select("id,tenant_id,ticket_id,file_name,mime_type,storage_path,visible_to_customer,upload_status").eq("id", attachmentId).eq("upload_status", "ready").maybeSingle();
    attachment = result.data;
  }
  if (!attachment) return json({ error: "Supportanhang nicht gefunden." }, { status: 404 });
  const signed = await admin.storage.from(SUPPORT_ATTACHMENT_BUCKET).createSignedUrl(attachment.storage_path, 10 * 60);
  if (signed.error || !signed.data?.signedUrl) return json({ error: "Der Anhang konnte nicht sicher geöffnet werden." }, { status: 503 });
  await admin.from("tenant_audit_log").insert({ tenant_id: attachment.tenant_id, actor_user_id: actorUserId, action: "support_attachment_opened", entity_type: "support_ticket", entity_id: attachment.ticket_id, metadata: { attachmentId: attachment.id, fileName: attachment.file_name } });
  return json({ ok: true, url: signed.data.signedUrl, fileName: attachment.file_name, mimeType: attachment.mime_type, expiresIn: 600 });
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
    maxBytes: 256_000,
  });
  if (guard) return guard;
  if (new URL(request.url).searchParams.get("audience") === "portal") return handlePortalRecords(request);
  const authorized = await authorizeDashboard(request);
  if (isResponse(authorized)) return authorized;
  const { client, profile } = authorized;
  const body = await request.json() as Payload;
  const action = cleanText(body.action, 80);

  if (action === "mark_notification_section_read") {
    const section = cleanText(body.section, 40);
    const marked = await client.rpc("mark_notification_section_read", {
      target_audience: "dashboard",
      target_scope: "dashboard",
      target_section: section,
      target_read_through: cleanText(body.readThrough, 80) || null,
    });
    if (marked.error) return json({ error: marked.error.message || "Lesestatus konnte nicht gespeichert werden" }, { status: 409 });
    return json({ ok: true, readAt: marked.data });
  }

  if (["create_legal_document", "update_legal_document", "publish_legal_document"].includes(action)) {
    if (!profile.securityAdmin) return json({ error: "Nur der Hauptadmin darf verbindliche Rechtsdokumente verwalten" }, { status: 403 });
    const admin = dashboardSupabase();
    if (!admin) return json({ error: "Rechtsdokument-Verwaltung ist nicht konfiguriert" }, { status: 503 });
    const id = cleanText(body.id, 80);
    if (action === "publish_legal_document") {
      if (!id || body.confirmation !== "VERÖFFENTLICHEN" || body.legalReviewed !== true) return json({ error: "Die geprüfte Fassung muss ausdrücklich bestätigt werden" }, { status: 400 });
      const published = await admin.rpc("publish_legal_document", { target_document: id });
      if (published.error) return json({ error: published.error.message }, { status: 400 });
      await writeAudit(client, profile, "legal_document_published", "legal_document", id);
      return json({ ok: true, id: published.data });
    }

    const documentType = cleanText(body.documentType, 40);
    const acceptanceScope = cleanText(body.acceptanceScope, 20);
    const version = cleanText(body.version, 40);
    const title = cleanText(body.title, 180);
    const summary = cleanText(body.summary, 1000);
    const contentMarkdown = typeof body.contentMarkdown === "string" ? body.contentMarkdown.trim().slice(0, 200_000) : "";
    const requiresAcceptance = body.requiresAcceptance !== false;
    const effectiveAtDate = typeof body.effectiveAt === "string" && body.effectiveAt ? new Date(body.effectiveAt) : null;
    if (effectiveAtDate && Number.isNaN(effectiveAtDate.getTime())) return json({ error: "Ungültiges Datum für die Wirksamkeit" }, { status: 400 });
    const effectiveAt = effectiveAtDate?.toISOString() ?? null;
    if (!["terms", "privacy", "data_processing"].includes(documentType) || !["user", "tenant"].includes(acceptanceScope)) return json({ error: "Ungültiger Dokumenttyp oder Geltungsbereich" }, { status: 400 });
    if (!version || !title || !contentMarkdown) return json({ error: "Version, Titel und vollständiger Rechtstext sind erforderlich" }, { status: 400 });
    if (/ENTWURF/i.test(contentMarkdown) && body.readyForReview === true) return json({ error: "Ein als Entwurf markierter Text kann nicht als geprüft gespeichert werden" }, { status: 400 });
    const values = { document_type: documentType, acceptance_scope: acceptanceScope, version, title, summary, content_markdown: contentMarkdown, requires_acceptance: requiresAcceptance, effective_at: effectiveAt, created_by: profile.userId };
    if (action === "create_legal_document") {
      const created = await admin.from("legal_documents").insert(values).select("id").single();
      if (created.error) return json({ error: created.error.message }, { status: 400 });
      await writeAudit(client, profile, "legal_document_created", "legal_document", created.data.id);
      return json({ ok: true, id: created.data.id });
    }
    if (!id) return json({ error: "Rechtsdokument fehlt" }, { status: 400 });
    const existing = await admin.from("legal_documents").select("id,status").eq("id", id).maybeSingle();
    if (!existing.data || existing.data.status !== "draft") return json({ error: "Nur Entwürfe dürfen bearbeitet werden" }, { status: 409 });
    const updated = await admin.from("legal_documents").update(values).eq("id", id).eq("status", "draft").select("id").maybeSingle();
    if (updated.error || !updated.data) return json({ error: updated.error?.message || "Entwurf wurde zwischenzeitlich verändert" }, { status: 409 });
    await writeAudit(client, profile, "legal_document_updated", "legal_document", id);
    return json({ ok: true, id });
  }

  if (action === "update_operational_incident") {
    if (!["owner_admin", "admin"].includes(profile.role)) return json({ error: "Nur Administratoren dürfen Betriebsmeldungen bearbeiten" }, { status: 403 });
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 30);
    if (!id || !["acknowledged", "resolved"].includes(status)) return json({ error: "Ungültige Betriebsmeldung" }, { status: 400 });
    const admin = dashboardSupabase();
    if (!admin) return json({ error: "Betriebsmonitoring ist nicht konfiguriert" }, { status: 503 });
    const now = new Date().toISOString();
    const update = status === "resolved"
      ? { status, resolved_by: profile.userId, resolved_at: now, updated_at: now }
      : { status, acknowledged_by: profile.userId, acknowledged_at: now, updated_at: now };
    const result = await admin.from("operational_incidents").update(update).eq("id", id).select("id,status").maybeSingle();
    if (result.error || !result.data) return json({ error: "Betriebsmeldung nicht gefunden" }, { status: 404 });
    await writeAudit(client, profile, `operational_incident_${status}`, "operational_incident", id);
    return json({ ok: true, record: result.data });
  }

  if (action === "test_operational_alert") {
    if (!profile.securityAdmin) return json({ error: "Nur der Hauptadmin darf den externen Alarmkanal testen" }, { status: 403 });
    const admin = dashboardSupabase();
    if (!admin) return json({ error: "Betriebsmonitoring ist nicht konfiguriert" }, { status: 503 });
    const testKey = `manual:critical-alert-test:${Date.now()}`;
    const incidentId = await reportOperationalIncident(admin, {
      key: testKey,
      source: "application",
      kind: "alert_delivery_test",
      severity: "critical",
      title: "Test der kritischen Alarmweiterleitung",
      message: "Dies ist ein bewusst ausgelöster Test. Es liegt keine Produktionsstörung vor.",
      metadata: { test: true, requestedBy: profile.userId },
    });
    if (!incidentId) return json({ error: "Testalarm konnte nicht erfasst werden. Migration 20260921 prüfen." }, { status: 503 });
    await writeAudit(client, profile, "operational_alert_tested", "operational_incident", incidentId);
    return json({ ok: true, incidentId });
  }

  if (["create_recovery_drill", "update_recovery_drill"].includes(action)) {
    if (!profile.securityAdmin) return json({ error: "Nur der Hauptadmin darf Wiederherstellungstests dokumentieren" }, { status: 403 });
    const admin = dashboardSupabase();
    if (!admin) return json({ error: "Wiederherstellungsverwaltung ist nicht konfiguriert" }, { status: 503 });
    const id = cleanText(body.id, 80);
    const drillType = cleanText(body.drillType, 40);
    const environment = cleanText(body.environment, 40) || "staging";
    const title = cleanText(body.title, 240);
    const backupReference = cleanText(body.backupReference, 500) || null;
    const notes = cleanText(body.notes, 8000) || null;
    const evidenceUrl = cleanText(body.evidenceUrl, 1000) || null;
    const status = cleanText(body.status, 30) || "scheduled";
    const checks = Array.isArray(body.verifiedChecks) ? body.verifiedChecks.filter((entry): entry is string => typeof entry === "string").slice(0, 30) : [];
    if (!["database_restore", "storage_restore", "full_recovery"].includes(drillType) || !["local", "staging", "isolated_project"].includes(environment) || !["scheduled", "running", "passed", "failed", "cancelled"].includes(status) || !title) return json({ error: "Ungültige Angaben zum Wiederherstellungstest" }, { status: 400 });
    if (["passed", "failed"].includes(status) && (!notes || checks.length < 3)) return json({ error: "Für den Abschluss sind Notizen und mindestens drei geprüfte Kontrollen erforderlich" }, { status: 400 });
    const now = new Date().toISOString();
    const values: Record<string, unknown> = { drill_type: drillType, environment, title, backup_reference: backupReference, notes, evidence_url: evidenceUrl, status, verified_checks: checks, updated_at: now };
    if (status === "running") values.started_at = now;
    if (["passed", "failed"].includes(status)) { values.completed_at = now; values.completed_by = profile.userId; values.recovery_time_minutes = Math.max(0, Math.min(100000, Math.round(Number(body.recoveryTimeMinutes) || 0))); }
    if (action === "create_recovery_drill") {
      values.created_by = profile.userId;
      const created = await admin.from("operational_recovery_drills").insert(values).select("id").single();
      if (created.error) return json({ error: created.error.message }, { status: 400 });
      await writeAudit(client, profile, "recovery_drill_created", "recovery_drill", created.data.id);
      return json({ ok: true, id: created.data.id });
    }
    if (!id) return json({ error: "Wiederherstellungstest fehlt" }, { status: 400 });
    const updated = await admin.from("operational_recovery_drills").update(values).eq("id", id).select("id,status").maybeSingle();
    if (updated.error || !updated.data) return json({ error: "Wiederherstellungstest nicht gefunden" }, { status: 404 });
    await writeAudit(client, profile, "recovery_drill_updated", "recovery_drill", id);
    return json({ ok: true, record: updated.data });
  }

  if (action === "update_sla_policy") {
    if (!profile.securityAdmin) return json({ error: "Nur der Hauptadmin darf SLA-Regeln verändern" }, { status: 403 });
    const packageCode = cleanText(body.packageCode, 40);
    const supportLabel = cleanText(body.supportLabel, 120);
    const coverageDescription = cleanText(body.coverageDescription, 500);
    const criticalCoverage = cleanText(body.criticalCoverage, 30);
    const integerValue = (value: unknown, minimum: number, maximum: number) => {
      const parsed = Math.round(Number(value));
      return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
    };
    const targets = {
      critical_response_minutes: integerValue(body.criticalResponseMinutes, 15, 10080),
      high_response_minutes: integerValue(body.highResponseMinutes, 15, 10080),
      normal_response_minutes: integerValue(body.normalResponseMinutes, 15, 20160),
      low_response_minutes: integerValue(body.lowResponseMinutes, 15, 40320),
    };
    const orderedTargets = targets.critical_response_minutes !== null
      && targets.high_response_minutes !== null
      && targets.normal_response_minutes !== null
      && targets.low_response_minutes !== null
      && targets.critical_response_minutes <= targets.high_response_minutes
      && targets.high_response_minutes <= targets.normal_response_minutes
      && targets.normal_response_minutes <= targets.low_response_minutes;
    if (!packageCode || !supportLabel || !coverageDescription || !["business_hours", "24x7"].includes(criticalCoverage) || !orderedTargets) {
      return json({ error: "SLA-Regeln sind unvollständig oder ungültig" }, { status: 400 });
    }
    const admin = dashboardSupabase();
    if (!admin) return json({ error: "SLA-Verwaltung ist nicht konfiguriert" }, { status: 503 });
    const previous = await admin.from("support_sla_policies").select("*").eq("package_code", packageCode).maybeSingle();
    if (!previous.data) return json({ error: "Supportpaket nicht gefunden" }, { status: 404 });
    const result = await admin.from("support_sla_policies").update({
      support_label: supportLabel,
      coverage_description: coverageDescription,
      critical_coverage: criticalCoverage,
      ...targets,
      updated_at: new Date().toISOString(),
    }).eq("package_code", packageCode).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "support_sla_policy_updated", "support_sla_policy", packageCode, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  if (isSupportKnowledgeAction(action)) return handleSupportKnowledgeAction(client, profile, body, action);

  if (action === "prepare_support_attachment") {
    if (!["owner_admin", "admin"].includes(profile.role)) return json({ error: "Nur Administratoren dürfen Kundendateien senden." }, { status: 403 });
    const admin = dashboardSupabase();
    const ticketId = cleanText(body.ticketId, 80);
    const fileName = safeFileName(body.fileName);
    const mimeType = cleanText(body.mimeType, 100).toLowerCase();
    const sizeBytes = Math.max(0, Math.floor(Number(body.sizeBytes) || 0));
    if (!admin || !ticketId) return json({ error: "Supportticket oder Dateispeicher fehlt." }, { status: 400 });
    const ticket = await admin.from("support_tickets").select("id,tenant_id,status").eq("id", ticketId).maybeSingle();
    if (!ticket.data) return json({ error: "Supportanfrage nicht gefunden." }, { status: 404 });
    if (["closed", "cancelled"].includes(ticket.data.status)) return json({ error: "Zu diesem abgeschlossenen Ticket können keine Dateien mehr hochgeladen werden." }, { status: 409 });
    const prepared = await prepareSupportAttachment(admin, {
      tenantId: ticket.data.tenant_id,
      ticketId,
      uploadedBy: profile.userId,
      uploadedByType: "support",
      fileName,
      mimeType,
      sizeBytes,
      aiAnalysisAllowed: false,
    });
    if ("error" in prepared) return json({ error: prepared.error }, { status: prepared.status });
    return json({ ok: true, ...prepared });
  }

  if (action === "finalize_support_attachment") {
    if (!["owner_admin", "admin"].includes(profile.role)) return json({ error: "Nur Administratoren dürfen Kundendateien senden." }, { status: 403 });
    const admin = dashboardSupabase();
    const attachmentId = cleanText(body.attachmentId, 80);
    if (!admin || !attachmentId) return json({ error: "Supportanhang fehlt." }, { status: 400 });
    const attachment = await admin.from("support_ticket_attachments").select("*").eq("id", attachmentId).eq("uploaded_by", profile.userId).eq("uploaded_by_type", "support").maybeSingle();
    if (!attachment.data) return json({ error: "Supportanhang nicht gefunden." }, { status: 404 });
    if (attachment.data.upload_status === "ready") return json({ ok: true, attachment: attachment.data });
    const finalized = await finalizeSupportAttachment(admin, attachment.data);
    if ("error" in finalized) return json({ error: finalized.error }, { status: finalized.status });
    await writeAudit(client, profile, "support_attachment_uploaded", "support_ticket", attachment.data.ticket_id, null, { attachmentId, fileName: attachment.data.file_name });
    return json({ ok: true, attachment: finalized.attachment });
  }

  if (action === "update_support_ticket") {
    if (!["owner_admin", "admin"].includes(profile.role)) return json({ error: "Nur Administratoren dürfen Supportfälle bearbeiten" }, { status: 403 });
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 30);
    const priority = cleanText(body.priority, 20);
    const publicResponse = cleanText(body.publicResponse, 8000);
    const internalNote = cleanText(body.internalNote, 8000);
    const attachmentIds = Array.isArray(body.attachmentIds)
      ? [...new Set(body.attachmentIds.map((entry) => cleanText(entry, 80)).filter(Boolean))].slice(0, 5)
      : [];
    const assignedTo = cleanText(body.assignedTo, 80) || null;
    if (!id || !["new", "in_progress", "waiting_customer", "resolved", "closed", "cancelled"].includes(status) || !["low", "normal", "high", "critical"].includes(priority)) {
      return json({ error: "Ungültiger Supportstatus oder Priorität" }, { status: 400 });
    }
    const admin = dashboardSupabase();
    if (!admin) return json({ error: "Supportverwaltung ist nicht konfiguriert" }, { status: 503 });
    const existing = await admin.from("support_tickets").select("*,tenant:tenants(client_id,name)").eq("id", id).maybeSingle();
    if (!existing.data) return json({ error: "Supportanfrage nicht gefunden" }, { status: 404 });
    if (attachmentIds.length && !publicResponse) return json({ error: "Ergänzen Sie zu den ausgewählten Dateien eine kurze sichtbare Nachricht für den Kunden." }, { status: 400 });
    if (attachmentIds.length) {
      const attachments = await admin.from("support_ticket_attachments").select("id").in("id", attachmentIds).eq("ticket_id", id).eq("tenant_id", existing.data.tenant_id).eq("uploaded_by", profile.userId).eq("uploaded_by_type", "support").eq("upload_status", "ready").is("message_id", null);
      if (attachments.error || attachments.data?.length !== attachmentIds.length) return json({ error: "Mindestens ein Anhang ist noch nicht vollständig hochgeladen." }, { status: 409 });
    }
    const transitions: Record<string, string[]> = {
      new: ["new", "in_progress", "waiting_customer", "resolved", "cancelled"],
      in_progress: ["in_progress", "waiting_customer", "resolved", "cancelled"],
      waiting_customer: ["waiting_customer", "in_progress", "resolved", "cancelled"],
      resolved: ["resolved", "in_progress", "closed"],
      closed: ["closed"], cancelled: ["cancelled"],
    };
    if (!transitions[existing.data.status]?.includes(status)) return json({ error: "Dieser Supportstatus kann nicht so geändert werden" }, { status: 409 });
    if (["waiting_customer", "resolved"].includes(status) && !publicResponse && existing.data.status !== status) return json({ error: "Für diesen Status ist eine sichtbare Kundenantwort erforderlich" }, { status: 400 });
    let targetMinutes = existing.data.response_target_minutes;
    let dueAt = existing.data.first_response_due_at;
    // Bestehende Fälle behalten ihren SLA-Snapshot. Nur eine bewusste
    // Neueinstufung erhält das heute gültige Ziel für die neue Priorität.
    if (priority !== existing.data.priority) {
      const policy = await admin.from("support_sla_policies").select("*").eq("package_code", existing.data.package_code_snapshot).maybeSingle();
      if (!policy.data) return json({ error: "Die zugehörige SLA-Regel fehlt" }, { status: 409 });
      targetMinutes = priority === "critical" ? policy.data.critical_response_minutes : priority === "high" ? policy.data.high_response_minutes : priority === "normal" ? policy.data.normal_response_minutes : policy.data.low_response_minutes;
      const coverageMode = priority === "critical" ? policy.data.critical_coverage : "business_hours";
      const due = await admin.rpc("calculate_support_due_at", {
        base_time: existing.data.created_at,
        target_minutes: targetMinutes,
        target_timezone: policy.data.business_timezone,
        day_start: policy.data.business_start,
        day_end: policy.data.business_end,
        coverage_mode: coverageMode,
      });
      if (due.error || !due.data) return json({ error: "SLA-Frist konnte nicht berechnet werden" }, { status: 409 });
      dueAt = due.data;
    }
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      status, priority, assigned_to: assignedTo, response_target_minutes: targetMinutes,
      first_response_due_at: dueAt, updated_at: now,
      ai_handling_status: "disabled", ai_disabled_at: now, ai_disabled_by: profile.userId,
      ai_escalation_reason: null, ai_escalated_at: null,
    };
    if (publicResponse && !existing.data.first_responded_at) update.first_responded_at = now;
    if (status === "resolved") update.resolved_at = existing.data.resolved_at || now;
    if (status === "in_progress" && existing.data.status === "resolved") { update.resolved_at = null; update.closed_at = null; }
    if (status === "closed") { update.resolved_at = existing.data.resolved_at || now; update.closed_at = now; }
    const changed = await admin.from("support_tickets").update(update).eq("id", id).eq("updated_at", existing.data.updated_at).select("*").maybeSingle();
    if (changed.error || !changed.data) return json({ error: "Supportanfrage wurde zwischenzeitlich verändert" }, { status: 409 });
    let publicMessageId: string | null = null;
    if (publicResponse) {
      const inserted = await admin.from("support_ticket_messages").insert({ ticket_id: id, tenant_id: existing.data.tenant_id, author_user_id: profile.userId, author_type: "support", author_name: profile.displayName, body: publicResponse, visible_to_customer: true }).select("id").single();
      if (inserted.error) return json({ error: "Supportfall wurde aktualisiert, die Kundenantwort aber nicht gespeichert" }, { status: 500 });
      publicMessageId = inserted.data.id;
    }
    if (internalNote) {
      const inserted = await admin.from("support_ticket_messages").insert({ ticket_id: id, tenant_id: existing.data.tenant_id, author_user_id: profile.userId, author_type: "support", author_name: profile.displayName, body: internalNote, visible_to_customer: false });
      if (inserted.error) return json({ error: "Supportfall wurde aktualisiert, die interne Notiz aber nicht gespeichert" }, { status: 500 });
    }
    if (publicMessageId && attachmentIds.length) {
      const linked = await admin.from("support_ticket_attachments").update({ message_id: publicMessageId, updated_at: now }).in("id", attachmentIds).eq("ticket_id", id).eq("tenant_id", existing.data.tenant_id).eq("uploaded_by", profile.userId).eq("uploaded_by_type", "support").eq("upload_status", "ready").is("message_id", null);
      if (linked.error) return json({ error: "Die Antwort wurde gespeichert, die Anhänge konnten aber noch nicht zugeordnet werden." }, { status: 409 });
    }
    await writeAudit(client, profile, "support_ticket_updated", "support_ticket", id, { status: existing.data.status, priority: existing.data.priority }, { status, priority, publicResponse: Boolean(publicResponse), internalNote: Boolean(internalNote) });
    const tenant = Array.isArray(existing.data.tenant) ? existing.data.tenant[0] : existing.data.tenant;
    if (publicResponse && tenant?.client_id) {
      await sendCustomerStatusNotification(client, tenant.client_id, `Support ${existing.data.ticket_number}: ${existing.data.title}`, "Neue Antwort von SwissCompact", publicResponse);
    }
    return json({ ok: true, record: changed.data });
  }

  if (action === "set_support_ai_mode") {
    if (!["owner_admin", "admin"].includes(profile.role)) return json({ error: "Nur Administratoren dürfen den KI-Erstsupport steuern" }, { status: 403 });
    const id = cleanText(body.id, 80);
    const mode = cleanText(body.mode, 20);
    if (!id || !["resume", "takeover"].includes(mode)) return json({ error: "Ungültige KI-Supportaktion" }, { status: 400 });
    const admin = dashboardSupabase();
    if (!admin) return json({ error: "Supportverwaltung ist nicht konfiguriert" }, { status: 503 });
    const existing = await admin.from("support_tickets").select("*").eq("id", id).maybeSingle();
    if (!existing.data) return json({ error: "Supportanfrage nicht gefunden" }, { status: 404 });
    if (["closed", "cancelled", "resolved"].includes(existing.data.status)) return json({ error: "Für abgeschlossene Supportfälle kann der KI-Erstsupport nicht geändert werden" }, { status: 409 });
    const now = new Date().toISOString();
    if (mode === "takeover") {
      const changed = await admin.from("support_tickets").update({
        ai_handling_status: "disabled",
        ai_disabled_at: now,
        ai_disabled_by: profile.userId,
        ai_escalation_reason: null,
        ai_escalated_at: null,
        assigned_to: existing.data.assigned_to || profile.userId,
        status: existing.data.status === "new" ? "in_progress" : existing.data.status,
        updated_at: now,
      }).eq("id", id).select("*").single();
      if (changed.error) return json({ error: changed.error.message }, { status: 409 });
      await writeAudit(client, profile, "support_ai_taken_over", "support_ticket", id, { aiHandlingStatus: existing.data.ai_handling_status }, { aiHandlingStatus: "disabled" });
      return json({ ok: true, record: changed.data });
    }
    const prepared = await admin.from("support_tickets").update({
      ai_handling_status: "eligible",
      ai_attempt_count: 0,
      ai_confidence: null,
      ai_escalation_reason: null,
      ai_escalated_at: null,
      ai_disabled_at: null,
      ai_disabled_by: null,
      updated_at: now,
    }).eq("id", id);
    if (prepared.error) return json({ error: prepared.error.message }, { status: 409 });
    await writeAudit(client, profile, "support_ai_resumed", "support_ticket", id, { aiHandlingStatus: existing.data.ai_handling_status }, { aiHandlingStatus: "eligible" });
    const result = await processSupportWithAi(admin, id, null, `admin:${id}:${Date.now()}`);
    return json({ ok: true, ai: result });
  }

  if (action === "update_data_rights_request") {
    if (!["owner_admin", "admin"].includes(profile.role)) return json({ error: "Nur Administratoren dürfen Datenschutzanfragen bearbeiten" }, { status: 403 });
    const id = cleanText(body.id, 80);
    const nextStatus = cleanText(body.status, 30);
    const reviewNote = cleanText(body.reviewNote, 4000);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return json({ error: "Datenschutzanfrage fehlt" }, { status: 400 });
    if (!["reviewing", "approved", "processing", "completed", "rejected"].includes(nextStatus)) return json({ error: "Ungültiger Bearbeitungsstatus" }, { status: 400 });
    if (["completed", "rejected"].includes(nextStatus) && !reviewNote) return json({ error: "Für den Abschluss ist eine dokumentierte Rückmeldung erforderlich" }, { status: 400 });
    const existing = await client.from("tenant_data_rights_requests").select("id,tenant_id,request_type,status,review_note,retention_resolution").eq("id", id).maybeSingle();
    if (!existing.data) return json({ error: "Datenschutzanfrage nicht gefunden" }, { status: 404 });
    const transitions: Record<string, string[]> = {
      submitted: ["reviewing", "rejected"],
      reviewing: ["approved", "rejected"],
      approved: ["processing", "completed", "rejected"],
      processing: ["completed", "rejected"],
    };
    if (!transitions[existing.data.status]?.includes(nextStatus)) return json({ error: "Dieser Statuswechsel ist nicht zulässig" }, { status: 409 });
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      status: nextStatus,
      review_note: reviewNote || existing.data.review_note,
      reviewed_by: profile.userId,
      reviewed_at: now,
    };
    if (nextStatus === "completed") {
      update.completed_at = now;
      update.retention_resolution = {
        decision: "completed_after_manual_review",
        note: reviewNote,
        recordedAt: now,
        recordedBy: profile.userId,
      };
    }
    const result = await client.from("tenant_data_rights_requests").update(update).eq("id", id).eq("status", existing.data.status).select("id,tenant_id,request_type,status,review_note,retention_resolution,reviewed_at,completed_at,updated_at").maybeSingle();
    if (result.error || !result.data) return json({ error: "Datenschutzanfrage wurde zwischenzeitlich verändert" }, { status: 409 });
    await Promise.all([
      writeAudit(client, profile, "data_rights_status_change", "data_rights_request", id, existing.data, result.data),
      client.from("tenant_audit_log").insert({ tenant_id: existing.data.tenant_id, actor_user_id: profile.userId, action: "data_rights_status_changed", entity_type: "data_rights_request", entity_id: id, metadata: { requestType: existing.data.request_type, previousStatus: existing.data.status, status: nextStatus } }),
    ]);
    return json({ ok: true, record: result.data });
  }

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
  if (search.get("supportAttachment")) return handleSupportAttachment(request, cleanText(search.get("supportAttachment"), 80));
  return json({ error: "Nicht gefunden" }, { status: 404 });
}
