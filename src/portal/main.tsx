import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import { DetailedError, Upload } from "tus-js-client";
import * as UpChunk from "@mux/upchunk";
import QRCode from "qrcode";
import { registerServiceWorker } from "../pwa/registerServiceWorker";
import { mountInstallPrompt } from "../pwa/installPrompt";
import "./portal.css";
import "./portal-media.css";
import "./portal-ai.css";
import "./portal-campaign.css";
import "./portal-devices.css";
import "./portal-pairing.css";
import "./portal-records.css";
import "./portal-service.css";
import "./portal-customer-records.css";
import "./portal-project-collaboration.css";
import "./portal-safety.css";
import "./portal-onboarding.css";
import "./portal-scroll.css";
import "./portal-partners.css";
import "./portal-templates.css";
import "./portal-display-management.css";
import "./portal-hierarchy.css";
import "./portal-campaign-versions.css";
import "./portal-semantics.css";
import { PartnerNetworkView, type PartnerNetworkData } from "./PartnerNetworkView";
import { CampaignQuickStartDialog, SaveCampaignTemplateDialog, type CampaignTemplateChoice, type CampaignTemplatesData } from "./CampaignTemplates";
import { DisplayManagementView, type DisplayGroupsData } from "./DisplayManagementView";
import { areaLineage, buildHierarchyTargets, HierarchyPlaylistTabs, HierarchySelectionShortcuts } from "./CampaignHierarchyPlanner";
import { CampaignVersionHistoryDialog, type CampaignVersionsData } from "./CampaignVersionHistory";

type PortalProfile = { displayName: string; email: string; tenantName: string; tenantSlug: string; role: "owner" | "admin" | "editor" | "viewer"; enabledModules: string[]; branding?: { accent?: string } };
type Site = { id: string; name: string; active: boolean; address?: Record<string, string> };
type Area = { id: string; site_id: string; parent_id?: string | null; name: string; kind: "building" | "floor" | "area" | "zone"; active: boolean };
type Display = { id: string; site_id?: string; area_id?: string | null; name: string; kind: string; status: string; orientation?: string; resolution?: { width?: number; height?: number }; screen_size_inches?: number | null; panel_technology?: string; use_category?: string | null; last_seen_at?: string; configuration_version?: number; last_acknowledged_version?: number | null; last_delivery_at?: string | null; delivery_status?: string; last_delivery_error?: string | null; fallback_content_id?: string | null; created_at?: string; creator_name?: string; site?: { name?: string }; area?: { id?: string; name?: string; kind?: string; parent_id?: string | null } };

const DISPLAY_SIZE_LANDSCAPE_CM: Record<number, { width: number; height: number }> = {
  22: { width: 49, height: 27 },
  24: { width: 53, height: 30 },
  27: { width: 60, height: 34 },
  32: { width: 71, height: 40 },
  55: { width: 121, height: 68 },
  65: { width: 144, height: 81 },
  75: { width: 166, height: 93 },
};
const LED_AUTO_THRESHOLD_INCHES = 75;
type MediaMetadata = { width: number; height: number; durationSeconds?: number; aspectRatio: number; orientation: "landscape" | "portrait" | "square"; inspectedAt: string; validationVersion: number };
type Content = { id: string; title: string; content_type: string; status: string; payload?: { text?: string; uploadState?: string; processingState?: string; processingError?: string; compatibilityStatus?: string; mediaProvider?: "supabase" | "mux"; posterPath?: string; mediaMetadata?: MediaMetadata; serviceRequest?: boolean; serviceRequestStatus?: string; requestType?: string; requestTypeLabel?: string; objective?: string; deliverables?: string; desiredDate?: string | null; budget?: string | null; requesterEmail?: string; requesterName?: string }; preview_url?: string | null; poster_url?: string | null; created_at?: string; creator_name?: string; updated_at: string };
type CampaignContentLink = { position: number; duration_seconds: number; content: { id: string; title: string; content_type: string; status: string } | null };
type Campaign = { id: string; name: string; theme?: string | null; status: string; priority?: number; starts_at?: string; ends_at?: string; schedule?: { portalSetupStep?: number; portalPlaylistStrategy?: CampaignContentMode; portalHierarchyPlaylists?: Record<string, PlaylistEntry[]> } | null; scope_site_id?: string | null; scope_area_id?: string | null; created_at?: string; creator_name?: string; updated_at: string; content_links?: CampaignContentLink[]; target_assignments?: Array<{ display_id: string; content_links: CampaignContentLink[] }>; display_links?: Array<{ display_id: string; display: { id: string; name: string; status: string; site?: { name?: string }; area?: { id?: string; name?: string; kind?: string } } | null }> };
type Subscription = { package_code: string; status: string; starts_on: string; minimum_ends_on?: string; monthly_amount_chf?: number; included_ai_credits?: number } | null;
type Member = { id: string; role: string; display_name?: string; active: boolean; access_status: "invited" | "active" | "suspended" | "revoked"; invited_at?: string; accepted_at?: string; verified_at?: string };
type PairingInfo = { displayId: string; code: string; expiresAt: string; displayName?: string };
type AiCredits = {
  enabled: boolean;
  stripeEnabled: boolean;
  balance: { included_remaining: number; purchased_balance: number; available: number; period_end: string } | null;
  qualities: Array<{ id: string; label: string; credits: number; description: string }>;
  formats: Array<{ id: string; label: string; size: string }>;
  packages: Array<{ id: string; label: string; credits: number; amountMinor: number; currency: string }>;
};
type CreditPurchaseNotice = { tone: "success" | "info"; title: string; detail: string };
type CreditCheckoutResult = {
  paymentStatus: string;
  purchase: { package_code: string; credits: number; amount_minor: number; currency: string; status: string };
  balance: { includedRemaining: number; purchasedBalance: number; available: number } | null;
};
type CustomerQuote = { id: string; quote_number: string; status: string; currency: string; total: number; valid_until?: string | null; items?: Array<{ description: string; quantity: number; unit: string; unitPriceChf: number; totalChf: number }>; terms?: string | null; document_hash?: string | null; accepted_by_name?: string | null; accepted_at?: string | null; created_at: string; updated_at: string; opportunity?: { title?: string } | Array<{ title?: string }> | null };
type CustomerProject = { id: string; quote_id?: string | null; order_number?: string | null; title: string; status: string; software_owner_name: string; hardware_owner_name: string; starts_on?: string | null; target_completion?: string | null; deposit_received: boolean; installation_payment_received: boolean; final_payment_received: boolean; created_at: string; updated_at: string };
type CustomerInvoice = { id: string; quote_id?: string | null; project_id?: string | null; invoice_number?: string | null; installment?: string | null; status: string; amount: number; currency: string; issued_on?: string | null; due_on?: string | null; paid_at?: string | null; document_available: boolean; created_at: string; updated_at: string; project?: { order_number?: string; title?: string } | Array<{ order_number?: string; title?: string }> | null };
type CustomerRecords = { quotes: CustomerQuote[]; projects: CustomerProject[]; invoices: CustomerInvoice[] };
type ProjectCollaboration = { available: boolean; briefings: Record<string, any>[]; messages: Record<string, any>[]; deliverables: Record<string, any>[]; versions: Record<string, any>[]; reviews: Record<string, any>[]; revisions: Record<string, any>[] };
type DisplaySafety = { versions: Array<{ id: string; display_id: string; version: number; source: string; campaign_id?: string | null; state: string; previous_version?: number | null; created_at: string }>; tests: Array<{ id: string; display_id: string; campaign_id: string; configuration_version: number; previous_version?: number | null; status: string; expires_at: string; created_at: string }>; alerts: Array<{ id: string; display_id: string; kind: string; severity: string; status: string; message: string; last_seen_at: string }> };
type PortalData = { profile: PortalProfile; sites: Site[]; areas: Area[]; displays: Display[]; content: Content[]; archivedContent: Content[]; serviceRequests: Content[]; customerRecords: CustomerRecords; projectCollaboration: ProjectCollaboration; partnerNetwork: PartnerNetworkData; campaignTemplates: CampaignTemplatesData; campaignVersions: CampaignVersionsData; displayGroups: DisplayGroupsData; displaySafety: DisplaySafety; campaigns: Campaign[]; subscription: Subscription; members: Member[]; aiCredits: AiCredits; mediaPipeline?: { muxVideoEnabled: boolean; maxVideoBytes: number } };
type View = "overview" | "records" | "content" | "archive" | "campaigns" | "displays" | "partners" | "settings";
type DeleteTarget = { kind: "archived_content" | "campaign" | "display"; id: string; name: string };
type CampaignPreset = { contentId?: string; displayId?: string; name?: string; theme?: string | null; priority?: number; scopeSiteId?: string | null; scopeAreaId?: string | null; displayIds?: string[]; targetAssignments?: Array<{ displayId: string; contentItems: Array<{ contentId: string; durationSeconds: number }> }>; playlistStrategy?: CampaignContentMode; hierarchyPlaylists?: Record<string, PlaylistEntry[]>; templateName?: string; defaultDurationDays?: number | null; startStep?: 1 | 2 | 3 | 4; fromTemplate?: boolean };

type PreparedMediaUpload = {
  provider: "supabase" | "mux";
  record: { id: string };
  upload: { provider: "supabase"; signedUrl: string; token: string; path: string; resumableUrl: string } | { provider: "mux"; url: string };
  posterUpload?: { signedUrl: string; token: string; path: string } | null;
};

type InspectedMedia = { file: File; metadata: MediaMetadata; poster?: Blob };

const MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska",
};

function mediaMimeType(file: File): string {
  const declared = file.type.toLowerCase().split(";", 1)[0];
  if (declared && declared !== "application/octet-stream") return declared;
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return MEDIA_MIME_BY_EXTENSION[extension] || declared;
}

function mediaOrientation(width: number, height: number): MediaMetadata["orientation"] {
  if (Math.abs(width - height) / Math.max(width, height) < 0.04) return "square";
  return width > height ? "landscape" : "portrait";
}

function mediaDurationLabel(seconds?: number): string {
  if (!seconds) return "";
  const rounded = Math.max(1, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")} Min.`;
}

function mediaMetadataLabel(metadata?: MediaMetadata): string {
  if (!metadata) return "";
  const orientation = metadata.orientation === "landscape" ? "Querformat" : metadata.orientation === "portrait" ? "Hochformat" : "Quadratisch";
  return [`${metadata.width} × ${metadata.height} px`, mediaDurationLabel(metadata.durationSeconds), orientation].filter(Boolean).join(" · ");
}

function contentIsDisplayReady(item: Content): boolean {
  if (!["image", "video"].includes(item.content_type)) return true;
  return item.payload?.uploadState === "ready" && (!item.payload.processingState || item.payload.processingState === "ready");
}

function contentProcessingLabel(item: Content): string {
  if (item.payload?.uploadState === "uploading") return "UPLOAD LÄUFT";
  if (item.payload?.processingState === "error") return "AUFBEREITUNG FEHLGESCHLAGEN";
  if (item.content_type === "video" && item.payload?.processingState && item.payload.processingState !== "ready") return "VIDEO WIRD AUFBEREITET";
  if (contentIsDisplayReady(item) && ["image", "video"].includes(item.content_type)) return "✓ DISPLAYBEREIT";
  return item.content_type.toUpperCase();
}

function waitForMediaEvent(target: HTMLMediaElement, successEvent: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("Die Mediendatei konnte nicht rechtzeitig gelesen werden.")), timeoutMs);
    const onSuccess = () => finish();
    const onError = () => finish(new Error("Die Datei ist beschädigt oder verwendet ein nicht unterstütztes Videoformat."));
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      target.removeEventListener(successEvent, onSuccess);
      target.removeEventListener("error", onError);
      error ? reject(error) : resolve();
    };
    target.addEventListener(successEvent, onSuccess, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

async function inspectMediaFile(file: File, expectedType: string): Promise<InspectedMedia> {
  const mimeType = mediaMimeType(file);
  const isImage = mimeType.startsWith("image/");
  const isVideo = mimeType.startsWith("video/");
  if ((expectedType === "image" && !isImage) || (expectedType === "video" && !isVideo)) {
    throw new Error(expectedType === "video" ? "Bitte wählen Sie eine MP4- oder WebM-Videodatei aus." : "Bitte wählen Sie eine JPG-, PNG- oder WebP-Bilddatei aus.");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    if (isImage) {
      const image = new Image();
      image.decoding = "async";
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Das Bild ist beschädigt oder kann nicht gelesen werden."));
      });
      image.src = objectUrl;
      await loaded;
      if (!image.naturalWidth || !image.naturalHeight) throw new Error("Das Bild enthält keine gültige Auflösung.");
      return { file, metadata: { width: image.naturalWidth, height: image.naturalHeight, aspectRatio: Number((image.naturalWidth / image.naturalHeight).toFixed(4)), orientation: mediaOrientation(image.naturalWidth, image.naturalHeight), inspectedAt: new Date().toISOString(), validationVersion: 1 } };
    }

    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;
    await waitForMediaEvent(video, "loadedmetadata", 20_000);
    const width = video.videoWidth;
    const height = video.videoHeight;
    const durationSeconds = video.duration;
    if (!width || !height || !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Das Video enthält keine gültige Bildspur oder Laufzeit.");
    if (durationSeconds > 24 * 60 * 60) throw new Error("Das Video ist länger als 24 Stunden und kann nicht verwendet werden.");
    const seekTime = Math.min(Math.max(durationSeconds * 0.08, 0.05), 1);
    const seeked = waitForMediaEvent(video, "seeked", 20_000);
    video.currentTime = seekTime;
    await seeked;
    const posterWidth = Math.min(1280, width);
    const posterHeight = Math.max(1, Math.round((posterWidth / width) * height));
    const canvas = document.createElement("canvas");
    canvas.width = posterWidth;
    canvas.height = posterHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Die Videovorschau konnte auf diesem Gerät nicht erzeugt werden.");
    context.drawImage(video, 0, 0, posterWidth, posterHeight);
    const poster = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Die Videovorschau konnte nicht gespeichert werden.")), "image/jpeg", 0.84));
    return { file, poster, metadata: { width, height, durationSeconds: Number(durationSeconds.toFixed(3)), aspectRatio: Number((width / height).toFixed(4)), orientation: mediaOrientation(width, height), inspectedAt: new Date().toISOString(), validationVersion: 1 } };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function storageUploadMessage(reason: unknown): string {
  let detail = reason instanceof Error ? reason.message : "";
  if (reason instanceof DetailedError) {
    const body = reason.originalResponse?.getBody();
    if (body) {
      try {
        const parsed = JSON.parse(body) as { message?: string; error?: string };
        detail = parsed.message || parsed.error || detail;
      } catch { detail = body; }
    }
  }
  if (/maximum.*size|file.*size|too large|payload.*large|413/i.test(detail)) {
    return "Das Video überschreitet das Upload-Limit von Supabase Storage. Bitte verkleinern Sie die Datei oder erhöhen Sie dort das globale Dateilimit.";
  }
  if (/invalid compact jws|signature|signatur/i.test(detail)) return "Die Upload-Freigabe ist ungültig oder abgelaufen. Bitte starten Sie den Upload erneut.";
  if (/mime|content.?type/i.test(detail)) return "Dieses Videoformat wird nicht unterstützt. Bitte verwenden Sie MP4 (H.264) oder WebM.";
  if (!navigator.onLine) return "Die Internetverbindung wurde unterbrochen. Bitte starten Sie den Upload erneut.";
  return detail ? `Die Datei konnte nicht übertragen werden: ${detail.slice(0, 240)}` : "Die Datei konnte nicht übertragen werden.";
}

function uploadVideo(file: File, prepared: PreparedMediaUpload, mimeType: string, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    if (prepared.upload.provider !== "supabase") {
      reject(new Error("Ungültiges Upload-Ziel"));
      return;
    }
    const upload = new Upload(file, {
      endpoint: prepared.upload.resumableUrl,
      headers: { "x-signature": prepared.upload.token },
      metadata: {
        bucketName: "swisscompact-media",
        objectName: prepared.upload.path,
        contentType: mimeType,
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      onProgress: (uploaded, total) => onProgress(total ? Math.round((uploaded / total) * 100) : 0),
      onError: reject,
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

function uploadMuxVideo(file: File, uploadUrl: string, mimeType: string, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = UpChunk.createUpload({
      endpoint: uploadUrl,
      file,
      headers: { "Content-Type": mimeType || "application/octet-stream" },
      chunkSize: 20 * 1024,
      attempts: 5,
      dynamicChunkSize: true,
    });
    upload.on("progress", (event) => onProgress(Math.max(0, Math.min(100, Math.round(Number(event.detail) || 0)))));
    upload.on("success", () => { onProgress(100); resolve(); });
    upload.on("error", (event) => {
      const detail = typeof event.detail === "string" ? event.detail : event.detail?.message;
      reject(new Error(detail || "Die Verbindung zur automatischen Videoaufbereitung wurde unterbrochen."));
    });
  });
}

async function uploadSignedBlob(blob: Blob, signedUrl: string): Promise<void> {
  const uploadBody = new FormData();
  uploadBody.append("cacheControl", "3600");
  uploadBody.append("", blob);
  const uploaded = await fetch(signedUrl, { method: "PUT", body: uploadBody, headers: { "x-upsert": "false" } });
  if (!uploaded.ok) {
    const detail = await uploaded.text().catch(() => "");
    throw new Error(detail || `${uploaded.status} ${uploaded.statusText}`);
  }
}

const labels: Record<string, string> = {
  draft: "Entwurf", review: "Prüfung", approved: "Freigegeben", published: "Veröffentlicht", archived: "Archiviert",
  scheduled: "Geplant", active: "Aktiv", paused: "Pausiert", completed: "Abgeschlossen", online: "Online", offline: "Offline",
  maintenance: "Wartung", provisioning: "Einrichtung", owner: "Inhaber", admin: "Admin", editor: "Bearbeitung", viewer: "Lesen",
};
const serviceRequestStatusLabels: Record<string, string> = { submitted: "Eingegangen", planning: "In Planung", production: "In Produktion", completed: "Abgeschlossen", declined: "Abgelehnt" };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Die Anfrage konnte nicht abgeschlossen werden.");
  return data as T;
}

function Icon({ name }: { name: View | "logout" | "plus" | "install" | "more" | "ios-share" }) {
  const paths: Record<string, React.ReactNode> = {
    install: <><path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></>,
    more: <><circle cx="5" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.8" fill="currentColor" stroke="none"/></>,
    "ios-share": <><path d="M12 15V3m0 0L8 7m4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></>,
    overview: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></>,
    records: <><path d="M7 3h10v4H7z"/><path d="M5 5H4a2 2 0 0 0-2 2v13h20V7a2 2 0 0 0-2-2h-1M7 12h10M7 16h7"/></>,
    content: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 15 3-3 3 3 2-2 3 3M8 9h.01"/></>,
    archive: <><path d="M4 7h16v13H4zM3 4h18v3H3z"/><path d="M9 11h6"/></>,
    campaigns: <><path d="M4 13V7l14-3v12L4 13Z"/><path d="M7 13v6h4v-5"/></>,
    displays: <><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>,
    partners: <><path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM16 11a3 3 0 1 0 0-6"/><path d="M2 21v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M15 14h1a5 5 0 0 1 5 5v2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/api/dashboard/login", { method: "POST", body: JSON.stringify({ email, password, audience: "portal" }) });
      onDone();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Anmeldung fehlgeschlagen"); }
    finally { setBusy(false); }
  }
  return <main className="login-shell">
    <section className="login-brand"><a className="wordmark" href="/">Swiss<span>Compact</span></a><p>Kundenportal</p><h1>Ihre digitale Kommunikation. Zentral gesteuert.</h1><p className="lead">Kampagnen, Bildschirme und Medien einfach verwalten – für alle Standorte.</p></section>
    <section className="login-panel"><div className="eyebrow">Sicherer Zugang</div><h2>Anmelden</h2><p>Verwenden Sie Ihren persönlichen SwissCompact-Zugang.</p>
      <form onSubmit={submit}>
        <label>E-Mail<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Passwort<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? "Anmeldung läuft …" : "Anmelden"}</button>
      </form><small>Benötigen Sie Unterstützung? kontakt@swisscompact.com</small>
    </section>
  </main>;
}

function PortalAccessSetup() {
  const [state, setState] = useState<"loading" | "ready" | "saving" | "success" | "error">("loading");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const client = useMemo(() => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    return url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!client) {
        if (active) { setError("Die sichere Portalaktivierung ist noch nicht konfiguriert. Bitte kontaktieren Sie SwissCompact."); setState("error"); }
        return;
      }
      try {
        const code = new URLSearchParams(location.search).get("code");
        if (code) {
          const exchanged = await client.auth.exchangeCodeForSession(code);
          if (exchanged.error) throw exchanged.error;
        }
        const session = await client.auth.getSession();
        if (session.error) throw session.error;
        if (!session.data.session?.user) throw new Error("Dieser Einladungslink ist ungültig oder abgelaufen.");
        if (!active) return;
        setEmail(session.data.session.user.email || "");
        setState("ready");
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Der Einladungslink konnte nicht geprüft werden.");
        setState("error");
      }
    })();
    return () => { active = false; };
  }, [client]);

  async function setPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get("password") || "");
    const confirmation = String(fields.get("passwordConfirmation") || "");
    setError("");
    if (password.length < 12) { setError("Das Passwort muss mindestens 12 Zeichen lang sein."); return; }
    if (password !== confirmation) { setError("Die beiden Passwörter stimmen nicht überein."); return; }
    setState("saving");
    try {
      const updated = await client.auth.updateUser({ password });
      if (updated.error) throw updated.error;
      await api("/api/dashboard/login", { method: "POST", body: JSON.stringify({ email: updated.data.user.email || email, password, audience: "portal" }) });
      await client.auth.signOut();
      history.replaceState({}, "", "/portal");
      setState("success");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Das Passwort konnte nicht gespeichert werden.");
      setState("ready");
    }
  }

  return <main className="login-shell portal-setup-shell">
    <section className="login-brand"><a className="wordmark" href="/">Swiss<span>Compact</span></a><p>Persönliche Einladung</p><h1>Ihr Portal ist bereit.</h1><p className="lead">Bestätigen Sie Ihren Zugang einmalig. Danach steuern Sie Kampagnen, Bildschirme und Inhalte zentral.</p></section>
    <section className="login-panel portal-setup-panel"><div className="eyebrow">Sicherer Zugang</div>
      {state === "loading" && <><h2>Einladung wird geprüft</h2><p>Bitte einen Moment warten …</p><div className="setup-loader" aria-label="Einladung wird geprüft"/></>}
      {state === "error" && <><h2>Link nicht verfügbar</h2><p className="form-error" role="alert">{error}</p><a className="primary setup-link" href="mailto:kontakt@swisscompact.com">SwissCompact kontaktieren</a></>}
      {(state === "ready" || state === "saving") && <><h2>Passwort festlegen</h2><p>Ihr persönlicher Zugang für <strong>{email}</strong>. Das erledigen Sie nur einmal.</p><form onSubmit={setPassword}><label>Neues Passwort<input name="password" type="password" autoComplete="new-password" minLength={12} required autoFocus/></label><label>Passwort wiederholen<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required/></label><small>Mindestens 12 Zeichen. Verwenden Sie kein Passwort aus einem anderen Dienst.</small>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary" disabled={state === "saving"}>{state === "saving" ? "Zugang wird aktiviert …" : "Passwort speichern und Portal öffnen"}</button></form></>}
      {state === "success" && <div className="setup-success"><span aria-hidden="true">✓</span><h2>Zugang aktiviert</h2><p>Ihr Passwort ist gespeichert. Sie können das SwissCompact Portal jetzt verwenden.</p><button className="primary" onClick={() => location.assign("/portal")}>Portal öffnen</button></div>}
    </section>
  </main>;
}

function Status({ value }: { value: string }) { return <span className={`status status-${value}`}>{labels[value] || value}</span>; }

function Empty({ children }: { children: React.ReactNode }) { return <div className="empty"><span>+</span><p>{children}</p></div>; }

const customerMoney = (value: unknown) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(Number(value || 0));
const customerDate = (value: unknown) => value ? new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(String(value))) : "Noch offen";
const relatedTitle = (value: CustomerQuote["opportunity"] | CustomerInvoice["project"]) => Array.isArray(value) ? value[0]?.title : value?.title;

function CustomerRecordsView({ data, onRefresh }: { data: PortalData; onRefresh: () => Promise<void> }) {
  const [filter, setFilter] = useState<"all" | "requests" | "quotes" | "projects" | "invoices">("all");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const quotesOpen = data.customerRecords.quotes.filter((quote) => ["sent", "viewed"].includes(quote.status)).length;
  const activeProjects = data.customerRecords.projects.filter((project) => !["completed", "cancelled"].includes(project.status)).length;
  const invoicesOpen = data.customerRecords.invoices.filter((invoice) => ["draft", "approval", "sent", "partially_paid", "overdue"].includes(invoice.status)).length;
  const quoteLabels: Record<string,string> = { sent: "Neu zur Prüfung", viewed: "In Prüfung", accepted: "Angenommen", declined: "Abgelehnt", expired: "Abgelaufen" };
  const projectLabels: Record<string,string> = { planning: "Planung", active: "In Umsetzung", blocked: "Rückfrage offen", acceptance: "Abnahme", completed: "Abgeschlossen", cancelled: "Storniert" };
  const invoiceLabels: Record<string,string> = { draft: "Erstellt", approval: "Wird geprüft", sent: "Offen", partially_paid: "Teilbezahlt", paid: "Bezahlt", overdue: "Überfällig", cancelled: "Storniert", credited: "Gutgeschrieben" };
  const installmentLabels: Record<string,string> = { deposit_50: "50-%-Anzahlung", installation_30: "30-%-Montagezahlung", acceptance_20: "20-%-Schlusszahlung", subscription: "Abonnement", other: "Rechnung" };

  async function openQuote(quote: CustomerQuote) {
    setBusyId(quote.id); setError("");
    try {
      const result = await api<{ url: string }>("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "create_portal_quote_access", quoteId: quote.id }) });
      location.assign(result.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Offerte konnte nicht geöffnet werden"); setBusyId(""); }
  }
  async function openDocument(kind: "quote" | "invoice", id: string) {
    setBusyId(id); setError("");
    try {
      const result = await api<{ url: string }>(`/api/dashboard/records?portalDocument=${kind}&id=${encodeURIComponent(id)}`);
      location.assign(result.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Dokument konnte nicht geöffnet werden"); setBusyId(""); }
  }

  return <section className="view customer-records-view"><div className="section-title"><div><h2>Meine Vorgänge</h2><p>Von Ihrer Anfrage bis zur bezahlten Rechnung – verständlich an einem Ort.</p></div></div>
    <div className="customer-record-metrics"><article><span>Offerten zur Entscheidung</span><strong>{quotesOpen}</strong><small>{quotesOpen ? "Ihre Rückmeldung ist gefragt" : "Aktuell nichts zu entscheiden"}</small></article><article><span>Laufende Aufträge</span><strong>{activeProjects}</strong><small>{activeProjects ? "SwissCompact arbeitet daran" : "Kein Auftrag in Umsetzung"}</small></article><article><span>Offene Rechnungen</span><strong>{invoicesOpen}</strong><small>{invoicesOpen ? "Zahlungsstatus prüfen" : "Alles bezahlt"}</small></article></div>
    {data.customerRecords.projects.length > 0 && <div className="project-workspace-launch"><div><b>Gemeinsame Auftragsakte</b><span>Briefing, Nachrichten, Entwürfe, Freigaben und Korrekturen</span></div><select aria-label="Auftrag wählen" value={selectedProjectId || ""} onChange={event => setSelectedProjectId(event.target.value || null)}><option value="">Auftrag wählen …</option>{data.customerRecords.projects.map(project => <option value={project.id} key={project.id}>{project.order_number || "Auftrag"} · {project.title}</option>)}</select>{selectedProjectId && <button className="primary" onClick={() => document.querySelector(".customer-project-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Auftragsakte öffnen</button>}</div>}
    <div className="customer-record-filters" role="tablist" aria-label="Vorgänge filtern">{([["all","Alles"],["requests","Anfragen"],["quotes","Offerten"],["projects","Aufträge"],["invoices","Rechnungen"]] as const).map(([id,label]) => <button role="tab" aria-selected={filter === id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)} key={id}>{label}</button>)}</div>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="customer-record-sections">
      {(filter === "all" || filter === "requests") && <section><header><div><span>01</span><div><small>Ihre Briefings</small><h3>Produktionsanfragen</h3></div></div><b>{data.serviceRequests.length}</b></header><div className="customer-record-list">{data.serviceRequests.map((item) => <article className="customer-record-card" key={item.id}><div className="customer-record-main"><span className="customer-record-kind">Anfrage · {item.payload?.requestTypeLabel || "Individuelle Produktion"}</span><h4>{item.title}</h4><p>{item.payload?.objective || "SwissCompact prüft Ihre Anfrage und meldet sich persönlich."}</p></div><div className="customer-record-side"><span className={`customer-record-status status-${item.payload?.serviceRequestStatus || "submitted"}`}>{serviceRequestStatusLabels[item.payload?.serviceRequestStatus || "submitted"] || "Eingegangen"}</span><small>{item.payload?.desiredDate ? `Wunschtermin ${customerDate(`${item.payload.desiredDate}T12:00:00`)}` : "Termin wird gemeinsam festgelegt"}</small></div></article>)}{!data.serviceRequests.length && <Empty>Noch keine Produktionsanfrage vorhanden.</Empty>}</div></section>}
      {(filter === "all" || filter === "quotes") && <section><header><div><span>02</span><div><small>Preis und Leistungsumfang</small><h3>Offerten</h3></div></div><b>{data.customerRecords.quotes.length}</b></header><div className="customer-record-list">{data.customerRecords.quotes.map((quote) => <article className="customer-record-card" key={quote.id}><div className="customer-record-main"><span className="customer-record-kind">Offerte · {quote.quote_number}</span><h4>{relatedTitle(quote.opportunity) || "Ihre SwissCompact Lösung"}</h4><p>Gültig bis {customerDate(quote.valid_until)} · Unveränderbar dokumentiert</p><strong className="customer-record-amount">{customerMoney(quote.total)}</strong></div><div className="customer-record-side"><span className={`customer-record-status status-${quote.status}`}>{quoteLabels[quote.status] || quote.status}</span>{["sent", "viewed"].includes(quote.status) && ["owner", "admin"].includes(data.profile.role) ? <button className="primary" disabled={busyId === quote.id} onClick={() => void openQuote(quote)}>{busyId === quote.id ? "Wird geöffnet …" : "Ansehen & entscheiden"}</button> : <button className="secondary" disabled={busyId === quote.id} onClick={() => void openDocument("quote", quote.id)}>{busyId === quote.id ? "Wird geöffnet …" : "PDF öffnen"}</button>}</div></article>)}{!data.customerRecords.quotes.length && <Empty>Noch keine freigegebene Offerte vorhanden.</Empty>}</div></section>}
      {(filter === "all" || filter === "projects") && <section><header><div><span>03</span><div><small>Planung und Umsetzung</small><h3>Aufträge</h3></div></div><b>{data.customerRecords.projects.length}</b></header><div className="customer-record-list">{data.customerRecords.projects.map((project) => <article className="customer-record-card project-record" key={project.id}><div className="customer-record-main"><span className="customer-record-kind">Auftrag · {project.order_number || "Nummer wird erstellt"}</span><h4>{project.title}</h4><p>{project.starts_on ? `Start ${customerDate(project.starts_on)}` : "Start wird gemeinsam festgelegt"} · {project.target_completion ? `Zieltermin ${customerDate(project.target_completion)}` : "Zieltermin noch offen"}</p><div className="project-responsibles"><span>Inhalt & Software: <b>{project.software_owner_name}</b></span><span>Hardware & Montage: <b>{project.hardware_owner_name}</b></span></div><div className="project-payment-progress"><span className={project.deposit_received ? "done" : ""}>50 %<small>{project.deposit_received ? "bezahlt" : "offen"}</small></span><i/><span className={project.installation_payment_received ? "done" : ""}>30 %<small>{project.installation_payment_received ? "bezahlt" : "später"}</small></span><i/><span className={project.final_payment_received ? "done" : ""}>20 %<small>{project.final_payment_received ? "bezahlt" : "nach Abnahme"}</small></span></div></div><div className="customer-record-side"><span className={`customer-record-status status-${project.status}`}>{projectLabels[project.status] || project.status}</span><small>Aktualisiert {customerDate(project.updated_at)}</small></div></article>)}{!data.customerRecords.projects.length && <Empty>Noch kein bestätigter Auftrag vorhanden.</Empty>}</div></section>}
      {(filter === "all" || filter === "invoices") && <section><header><div><span>04</span><div><small>Dokumente und Zahlung</small><h3>Rechnungen</h3></div></div><b>{data.customerRecords.invoices.length}</b></header><div className="customer-record-list">{data.customerRecords.invoices.map((invoice) => <article className="customer-record-card" key={invoice.id}><div className="customer-record-main"><span className="customer-record-kind">{installmentLabels[invoice.installment || ""] || "Rechnung"} · {invoice.invoice_number || "Nummer wird erstellt"}</span><h4>{relatedTitle(invoice.project) || "SwissCompact Auftrag"}</h4><p>{invoice.issued_on ? `Ausgestellt ${customerDate(invoice.issued_on)}` : "Erstellungsdatum offen"} · {invoice.due_on ? `Fällig ${customerDate(invoice.due_on)}` : "Zahlungsziel offen"}</p><strong className="customer-record-amount">{customerMoney(invoice.amount)}</strong></div><div className="customer-record-side"><span className={`customer-record-status status-${invoice.status}`}>{invoiceLabels[invoice.status] || invoice.status}</span>{invoice.document_available && <button className="secondary" disabled={busyId === invoice.id} onClick={() => void openDocument("invoice", invoice.id)}>{busyId === invoice.id ? "Wird geöffnet …" : "PDF herunterladen"}</button>}</div></article>)}{!data.customerRecords.invoices.length && <Empty>Noch keine Rechnung vorhanden.</Empty>}</div></section>}
    </div>
    {selectedProjectId && <CustomerProjectWorkspace project={data.customerRecords.projects.find(project => project.id === selectedProjectId)!} data={data} onRefresh={onRefresh} onClose={() => setSelectedProjectId(null)}/>}
  </section>;
}

function CustomerProjectWorkspace({ project, data, onRefresh, onClose }: { project: CustomerProject; data: PortalData; onRefresh: () => Promise<void>; onClose: () => void }) {
  const [tab, setTab] = useState<"overview" | "messages" | "files" | "revisions">("overview");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const collaboration = data.projectCollaboration;
  const briefing = collaboration.briefings.find(item => item.id === project.id)?.briefing || {};
  const messages = collaboration.messages.filter(item => item.project_id === project.id);
  const deliverables = collaboration.deliverables.filter(item => item.project_id === project.id);
  const versions = collaboration.versions.filter(item => item.project_id === project.id);
  const reviews = collaboration.reviews.filter(item => item.project_id === project.id);
  const revisions = collaboration.revisions.filter(item => item.project_id === project.id);
  const canEdit = data.profile.role !== "viewer";
  const canDecide = ["owner", "admin"].includes(data.profile.role);
  async function run(payload: Record<string, unknown>) { setBusy(true); setError(""); try { return await api<any>("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify(payload) }); } catch (reason) { setError((reason as Error).message); throw reason; } finally { setBusy(false); } }
  async function postMessage(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const message = new FormData(form).get("message"); await run({ action: "post_project_message", projectId: project.id, message }); form.reset(); await onRefresh(); }
  async function uploadReference(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); const file = fields.get("file") as File; if (!file?.size) return;
    setBusy(true); setError(""); try { const prepared = await api<any>("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "prepare_project_reference_upload", projectId: project.id, title: fields.get("title"), notes: fields.get("notes"), fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size }) }); const uploaded = await fetch(prepared.upload.signedUrl, { method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: file }); if (!uploaded.ok) throw new Error("Die Datei konnte nicht übertragen werden"); await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "finalize_project_reference_upload", versionId: prepared.versionId }) }); form.reset(); await onRefresh(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  async function openFile(versionId: string) { const target = window.open("about:blank", "_blank"); try { const result = await api<{ url: string }>(`/api/dashboard/records?portalProjectFile=${encodeURIComponent(versionId)}`); if (target) target.location.href = result.url; else location.assign(result.url); } catch (reason) { target?.close(); setError(reason instanceof Error ? reason.message : "Datei konnte nicht geöffnet werden"); } }
  async function review(version: Record<string, any>, decision: "approved" | "changes_requested", feedback: string) { await run({ action: "review_project_deliverable", projectId: project.id, deliverableId: version.deliverable_id, versionId: version.id, decision, feedback }); await onRefresh(); }
  if (!collaboration.available) return <section className="customer-project-workspace unavailable"><button className="workspace-close" onClick={onClose} aria-label="Auftragsakte schliessen">×</button><span>Auftragsakte</span><h3>{project.title}</h3><p>Die gemeinsame Auftragsakte wird gerade aktiviert. Ihre bisherigen Auftrags- und Rechnungsdaten bleiben vollständig verfügbar.</p></section>;
  return <section className="customer-project-workspace"><header><div><span>Gemeinsame Auftragsakte · {project.order_number}</span><h3>{project.title}</h3><p>Alles zu diesem Auftrag – ohne Suche, E-Mails oder unklare Dateiversionen.</p></div><button className="workspace-close" onClick={onClose} aria-label="Auftragsakte schliessen">×</button></header>
    <nav>{([["overview","Briefing"],["messages","Nachrichten"],["files","Entwürfe & Freigabe"],["revisions","Korrekturen"]] as const).map(([id,label]) => <button className={tab === id ? "active" : ""} onClick={() => setTab(id)} key={id}>{label}</button>)}</nav>
    {error && <div className="form-error" role="alert">{error}</div>}
    {tab === "overview" && <div className="customer-workspace-pane"><div className="workspace-guide"><b>1</b><div><h4>Was wurde vereinbart?</h4><p>Dieses Briefing ist die gemeinsame Grundlage für SwissCompact und Ihr Team.</p></div></div><dl className="customer-briefing"><div><dt>Ziel</dt><dd>{briefing.objective || "Wird gemeinsam ergänzt"}</dd></div><div><dt>Zielgruppe</dt><dd>{briefing.audience || "Wird gemeinsam ergänzt"}</dd></div><div><dt>Kernbotschaft</dt><dd>{briefing.keyMessage || "Wird gemeinsam ergänzt"}</dd></div><div><dt>Formate & Einsatz</dt><dd>{briefing.formats || "Wird gemeinsam ergänzt"}</dd></div>{briefing.notes && <div><dt>Weitere Vorgaben</dt><dd>{briefing.notes}</dd></div>}</dl></div>}
    {tab === "messages" && <div className="customer-workspace-pane"><div className="workspace-guide"><b>2</b><div><h4>Direkt mit SwissCompact schreiben</h4><p>Jede Nachricht bleibt dauerhaft beim richtigen Auftrag.</p></div></div><div className="customer-message-thread">{messages.map(message => <article className={message.author_type} key={message.id}><header><b>{message.author_name}</b><time>{customerDate(message.created_at)}</time></header><p>{message.body}</p></article>)}{!messages.length && <Empty>Noch keine Nachricht vorhanden.</Empty>}</div>{canEdit && <form onSubmit={postMessage}><label>Nachricht<textarea name="message" rows={4} required placeholder="Frage, Hinweis oder Rückmeldung …"/></label><button className="primary" disabled={busy}>{busy ? "Wird gesendet …" : "Nachricht senden"}</button></form>}</div>}
    {tab === "files" && <div className="customer-workspace-pane"><div className="workspace-guide"><b>3</b><div><h4>Entwürfe prüfen und freigeben</h4><p>Öffnen Sie die neuste Version. Danach freigeben oder einen konkreten Änderungswunsch senden.</p></div></div><div className="customer-deliverables">{deliverables.map(deliverable => { const itemVersions = versions.filter(version => version.deliverable_id === deliverable.id); const latest = itemVersions.find(version => Number(version.version) === Number(deliverable.current_version)); const decided = latest && reviews.some(review => review.deliverable_version_id === latest.id); return <article key={deliverable.id}><header><div><b>{deliverable.title}</b><small>{deliverable.kind} · Version {deliverable.current_version}</small></div><span className={`customer-record-status status-${deliverable.status}`}>{deliverable.status === "customer_review" ? "Ihre Prüfung" : deliverable.status === "approved" ? "Freigegeben" : deliverable.status}</span></header><div className="customer-version-list">{itemVersions.map(version => <button onClick={() => void openFile(version.id)} key={version.id}><b>Version {version.version}</b><span>{version.file_name}</span><small>{version.notes || "Datei öffnen"}</small></button>)}</div>{latest && deliverable.status === "customer_review" && !decided && canDecide && <ReviewDecision version={latest} busy={busy} review={review}/>}</article>; })}{!deliverables.length && <Empty>Noch kein Entwurf bereit.</Empty>}</div>{canEdit && <form className="customer-reference-upload" onSubmit={uploadReference}><h4>Briefing-Datei oder Referenz senden</h4><label>Bezeichnung<input name="title" required placeholder="z. B. Logo, Text oder Beispiel"/></label><label>Datei<input name="file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf" required/></label><label>Hinweis<textarea name="notes" rows={2}/></label><button className="secondary" disabled={busy}>{busy ? "Wird hochgeladen …" : "Datei hinzufügen"}</button></form>}</div>}
    {tab === "revisions" && <div className="customer-workspace-pane"><div className="workspace-guide"><b>4</b><div><h4>Korrekturen und Zusatzkosten</h4><p>Sie sehen vor Beginn, was enthalten ist und ob Zusatzkosten entstehen.</p></div></div><div className="customer-revision-list">{revisions.map(revision => <article key={revision.id}><header><b>Korrekturrunde {revision.round_number}</b><span>{revision.status === "customer_approval" ? "Ihre Entscheidung" : revision.status}</span></header><p><strong>Ihr Wunsch:</strong> {revision.request_text}</p>{revision.response_text && <p><strong>Antwort:</strong> {revision.response_text}</p>}<div className="revision-price">{revision.included ? "Im vereinbarten Umfang enthalten" : revision.additional_cost_chf ? `Zusatzkosten: ${customerMoney(revision.additional_cost_chf)}` : "Umfang wird geprüft"}</div>{revision.status === "customer_approval" && canDecide && <div className="revision-actions"><button className="secondary" disabled={busy} onClick={() => void run({ action: "decide_project_revision_cost", revisionId: revision.id, decision: "declined" }).then(() => location.reload())}>Ablehnen</button><button className="primary" disabled={busy} onClick={() => void run({ action: "decide_project_revision_cost", revisionId: revision.id, decision: "approved" }).then(() => location.reload())}>Kosten bestätigen</button></div>}</article>)}{!revisions.length && <Empty>Es gibt keine offenen Korrekturen.</Empty>}</div></div>}
  </section>;
}

function ReviewDecision({ version, busy, review }: { version: Record<string, any>; busy: boolean; review: (version: Record<string, any>, decision: "approved" | "changes_requested", feedback: string) => Promise<void> }) {
  const [feedback, setFeedback] = useState("");
  return <div className="review-decision"><label>Rückmeldung<textarea rows={3} value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="Bei einer Freigabe optional; bei Änderungswunsch bitte konkret beschreiben."/></label><div><button className="secondary" disabled={busy || !feedback.trim()} onClick={() => void review(version, "changes_requested", feedback)}>Änderung wünschen</button><button className="primary" disabled={busy} onClick={() => void review(version, "approved", feedback)}>Verbindlich freigeben</button></div></div>;
}

function DisplayPreview({ display, campaigns, content }: { display: Display; campaigns: Campaign[]; content: Content[] }) {
  const assigned = campaigns.filter((campaign) => (campaign.display_links || []).some((link) => link.display_id === display.id));
  const campaign = [...assigned].sort((a, b) => {
    const priority: Record<string, number> = { active: 0, scheduled: 1, draft: 2, review: 3, paused: 4 };
    return (priority[a.status] ?? 9) - (priority[b.status] ?? 9);
  })[0];
  const now = Date.now();
  const startsLater = Boolean(campaign?.starts_at && new Date(campaign.starts_at).getTime() > now);
  const ended = Boolean(campaign?.ends_at && new Date(campaign.ends_at).getTime() <= now);
  const live = campaign?.status === "active" && !startsLater && !ended;
  const planned = campaign?.status === "scheduled" || startsLater;
  const targetLinks = campaign?.target_assignments?.find((assignment) => assignment.display_id === display.id)?.content_links;
  const firstLink = [...(targetLinks?.length ? targetLinks : campaign?.content_links || [])].sort((a, b) => a.position - b.position)[0];
  const related = firstLink?.content as unknown;
  const linkedContent = (Array.isArray(related) ? related[0] : related) as { id?: string } | null;
  const item = content.find((entry) => entry.id === linkedContent?.id);
  const state = live ? "Live" : planned ? "Geplant" : campaign ? "Noch nicht aktiviert" : "Kein Motiv zugeordnet";

  return <div className={`screen display-preview ${display.orientation === "portrait" ? "portrait" : ""} ${item ? "has-content" : ""}`}>
    {item?.preview_url && item.content_type === "image" ? <img src={item.preview_url} alt="" loading="lazy"/> : item?.preview_url && item.content_type === "video" ? <video src={item.preview_url} autoPlay muted loop playsInline preload="metadata"/> : item ? <div className="display-preview-text">{item.payload?.text || item.title}</div> : <div className="display-preview-brand">Swiss<span>Compact</span></div>}
    <div className="display-preview-meta"><span className={live ? "live" : planned ? "planned" : "inactive"}>{state}</span>{campaign && <strong>{campaign.name}</strong>}</div>
    <button type="button" className="display-safety-overlay" onClick={() => window.dispatchEvent(new CustomEvent("swisscompact-display-safety", { detail: display }))}>Sicher veröffentlichen</button>
  </div>;
}

function DisplaySafetyDialog({ display, campaigns, content, safety, canEdit, onClose, onChanged }: { display: Display; campaigns: Campaign[]; content: Content[]; safety: DisplaySafety; canEdit: boolean; onClose: () => void; onChanged: () => void | Promise<void> }) {
  const assigned = campaigns.filter((campaign) => (campaign.display_links || []).some((link) => link.display_id === display.id));
  const versions = safety.versions.filter((version) => version.display_id === display.id).sort((a, b) => b.version - a.version);
  const activeTest = safety.tests.find((test) => test.display_id === display.id);
  const alerts = safety.alerts.filter((alert) => alert.display_id === display.id);
  const [fallbackId, setFallbackId] = useState(display.fallback_content_id || "");
  const [campaignId, setCampaignId] = useState(assigned[0]?.id || "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const approvedContent = content.filter((item) => ["approved", "published"].includes(item.status) && contentIsDisplayReady(item));
  const previewUrl = `/player?preview=${encodeURIComponent(display.id)}${campaignId ? `&campaign=${encodeURIComponent(campaignId)}` : ""}`;

  async function run(action: string, body: Record<string, unknown>) {
    setBusy(action); setError("");
    try {
      await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action, ...body }) });
      await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Aktion konnte nicht ausgeführt werden"); }
    finally { setBusy(""); }
  }

  const deliveryLabel = display.delivery_status === "delivered" && display.last_acknowledged_version === display.configuration_version
    ? "Vom Player bestätigt"
    : display.delivery_status === "offline" ? "Bildschirm ist offline" : display.delivery_status === "error" ? "Auslieferungsfehler" : "Wartet auf Bestätigung";

  return <div className="dialog-backdrop safety-backdrop"><section className="dialog display-safety-dialog" role="dialog" aria-modal="true"><button className="dialog-close" onClick={onClose}>×</button>
    <header><div><span className="eyebrow">Sichere Veröffentlichung</span><h2>{display.name}</h2><p>Erst ansehen, dann auf genau diesem Bildschirm testen und erst danach regulär starten.</p></div><div className={`delivery-state ${display.delivery_status || "pending"}`}><i/><span>{deliveryLabel}</span><small>Version {display.configuration_version || 1}{display.last_acknowledged_version ? ` · bestätigt ${display.last_acknowledged_version}` : ""}</small></div></header>
    {alerts.length > 0 && <div className="display-alerts">{alerts.map((alert) => <article className={alert.severity} key={alert.id}><div><strong>{alert.kind === "offline" ? "Verbindung unterbrochen" : alert.kind === "campaign_conflict" ? "Kampagnenkonflikt" : "Auslieferung prüfen"}</strong><p>{alert.message}</p></div>{canEdit && alert.status === "open" && <button disabled={Boolean(busy)} onClick={() => void run("acknowledge_display_alert", { alertId: alert.id })}>Gesehen</button>}</article>)}</div>}
    <div className="safety-flow">
      <section><b>1</b><div><h3>Gerätegetreu prüfen</h3><p>Die Vorschau verwendet dieselbe Playlist und dasselbe Format wie der Player.</p><label>Kampagne<select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}><option value="">Aktuell laufende Anzeige</option>{assigned.map((campaign) => <option value={campaign.id} key={campaign.id}>{campaign.name}</option>)}</select></label><a className="primary" href={previewUrl} target="_blank" rel="noreferrer">Vorschau öffnen</a></div></section>
      <section><b>2</b><div><h3>Auf diesem Bildschirm testen</h3>{activeTest ? <><p>Testversion {activeTest.configuration_version} läuft bis {new Date(activeTest.expires_at).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })} Uhr und wird danach automatisch zurückgesetzt.</p>{canEdit && <button className="secondary danger" disabled={Boolean(busy)} onClick={() => void run("cancel_display_test", { displayId: display.id })}>{busy === "cancel_display_test" ? "Wird beendet …" : "Test jetzt beenden"}</button>}</> : <><p>Nur dieser Bildschirm erhält die ausgewählte Kampagne für zehn Minuten.</p>{canEdit && <button className="primary" disabled={!campaignId || Boolean(busy)} onClick={() => void run("test_publish_campaign", { displayId: display.id, campaignId, durationMinutes: 10 })}>{busy === "test_publish_campaign" ? "Test wird vorbereitet …" : "10-Minuten-Test starten"}</button>}</>}</div></section>
      <section><b>3</b><div><h3>Ersatzinhalt festlegen</h3><p>Dieser Inhalt erscheint, wenn keine Kampagne oder ein Medium nicht verfügbar ist.</p><label>Ersatzinhalt<select value={fallbackId} onChange={(event) => setFallbackId(event.target.value)} disabled={!canEdit}><option value="">Kein Ersatzinhalt</option>{approvedContent.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>{canEdit && <button className="secondary" disabled={Boolean(busy) || fallbackId === (display.fallback_content_id || "")} onClick={() => void run("set_display_fallback", { displayId: display.id, contentId: fallbackId || null })}>{busy === "set_display_fallback" ? "Wird gespeichert …" : "Ersatzinhalt speichern"}</button>}</div></section>
      <section><b>4</b><div><h3>Letzte funktionierende Version</h3><p>Jede Änderung bleibt nachvollziehbar. Eine frühere Konfiguration kann als neue Version wiederhergestellt werden.</p><div className="version-list">{versions.slice(0, 5).map((version, index) => <div key={version.id}><span><strong>Version {version.version}</strong><small>{version.source === "test" ? "Test" : version.source === "rollback" ? "Wiederhergestellt" : version.source === "campaign" ? "Kampagne" : "Konfiguration"} · {new Date(version.created_at).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" })}</small></span>{canEdit && index > 0 && <button disabled={Boolean(busy)} onClick={() => void run("rollback_display", { displayId: display.id, version: version.version })}>Wiederherstellen</button>}</div>)}</div>{!versions.length && <small>Die erste sichere Version wird bei der nächsten Änderung erstellt.</small>}</div></section>
    </div>
    {error && <div className="form-error">{error}</div>}<footer><button className="secondary" onClick={onClose}>Schließen</button></footer>
  </section></div>;
}

function campaignHasContentForEveryDisplay(campaign: Campaign): boolean {
  const displayIds = (campaign.display_links || []).map((link) => link.display_id);
  if (!displayIds.length) return false;
  const targetAssignments = campaign.target_assignments || [];
  if (!targetAssignments.length) return Boolean(campaign.content_links?.length);
  return displayIds.every((displayId) => targetAssignments.some((assignment) => assignment.display_id === displayId && assignment.content_links.length > 0));
}

function PortalOnboarding({ currentStep, complete, campaignName, canEdit, onContinue, onStartNew }: { currentStep: 1 | 2 | 3 | 4; complete: boolean; campaignName?: string; canEdit: boolean; onContinue: () => void; onStartNew: () => void }) {
  const steps = [
    { title: "Wo anzeigen?", description: "Einen oder mehrere Bildschirme wählen." },
    { title: "Was anzeigen?", description: "Bild oder Video auswählen oder hochladen." },
    { title: "Wann anzeigen?", description: "Sofort starten oder einen Zeitraum festlegen." },
    { title: "Prüfen und veröffentlichen", description: "Vorschau kontrollieren und fertigstellen." },
  ];
  const current = steps[currentStep - 1];
  return <section className={`portal-onboarding ${complete ? "is-complete" : ""}`} aria-label="Geführte Ersteinrichtung">
    <header><div><span className="eyebrow">Geführte Einrichtung</span><h3>{complete ? "Ihre erste Anzeige ist bereit." : campaignName ? `„${campaignName}“ fortsetzen` : "In vier einfachen Schritten zur ersten Anzeige"}</h3><p>{complete ? "Bildschirm, Inhalt und Zeitpunkt sind vollständig eingerichtet." : "Sie beantworten nacheinander nur vier Fragen: Wo, was, wann und veröffentlichen."}</p></div><b>{complete ? "Bereit" : `${currentStep} von 4`}</b></header>
    <div className="portal-onboarding-steps">{steps.map((step, index) => { const number = index + 1; const done = complete || number < currentStep; const currentStepActive = !complete && number === currentStep; return <article className={done ? "done" : currentStepActive ? "current" : "locked"} key={step.title}><span>{done ? "✓" : number}</span><div><small>{done ? "Erledigt" : currentStepActive ? "Jetzt" : "Danach"}</small><strong>{step.title}</strong>{!done && <p>{currentStepActive ? step.description : `Wird nach „${steps[index - 1].title}“ verfügbar.`}</p>}</div>{currentStepActive && <b>→</b>}</article>; })}</div>
    <footer>{complete ? <><span><strong>Bereit für weitere Ausspielungen</strong><small>Bestehende Anzeigen bleiben unverändert.</small></span>{canEdit && <button type="button" className="secondary" onClick={onStartNew}>Etwas Neues anzeigen</button>}</> : <><span><strong>Nächster Schritt: {current.title}</strong><small>{campaignName ? `Die angefangene Ausspielung „${campaignName}“ wird fortgesetzt.` : current.description}</small></span>{canEdit ? <button type="button" className="primary" onClick={onContinue}>{campaignName ? "Einrichtung fortsetzen" : "Jetzt beginnen"}</button> : <small>Ein Inhaber oder Bearbeiter kann diesen Schritt ausführen.</small>}</>}</footer>
  </section>;
}

function Portal() {
  const [data, setData] = useState<PortalData | null>(null);
  const [session, setSession] = useState<"loading" | "guest" | "ready">("loading");
  const [view, setView] = useState<View>("overview");
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"content" | null>(null);
  const [serviceRequestDialog, setServiceRequestDialog] = useState(false);
  const [editingContent, setEditingContent] = useState<Content | null>(null);
  const [aiDialog, setAiDialog] = useState(false);
  const [creditNotice, setCreditNotice] = useState<CreditPurchaseNotice | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [campaignPreset, setCampaignPreset] = useState<CampaignPreset | null>(null);
  const [campaignInitialStep, setCampaignInitialStep] = useState<1 | 2 | 3 | 4>(1);
  const [campaignQuickStart, setCampaignQuickStart] = useState(false);
  const [templateCampaign, setTemplateCampaign] = useState<Campaign | null>(null);
  const [versionCampaign, setVersionCampaign] = useState<Campaign | null>(null);
  const [displaySetup, setDisplaySetup] = useState<"standalone" | "campaign" | null>(null);
  const [editingDisplay, setEditingDisplay] = useState<Display | null>(null);
  const [safetyDisplay, setSafetyDisplay] = useState<Display | null>(null);
  useEffect(() => {
    const openSafety = (event: Event) => setSafetyDisplay((event as CustomEvent<Display>).detail);
    window.addEventListener("swisscompact-display-safety", openSafety);
    return () => window.removeEventListener("swisscompact-display-safety", openSafety);
  }, []);
  const [iosInstallHint, setIosInstallHint] = useState(false);
  useEffect(() => { mountInstallPrompt("[data-pwa-install]", () => setIosInstallHint(true)); }, [session]);
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [deferredPairings, setDeferredPairings] = useState<PairingInfo[]>([]);
  const [pairingBusyId, setPairingBusyId] = useState("");
  const [archiveBusyId, setArchiveBusyId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [mobileMore, setMobileMore] = useState(false);
  const load = useCallback(async (showBoot = true): Promise<PortalData | null> => {
    if (showBoot) setSession("loading");
    setError("");
    try {
      const overview = await api<PortalData>("/api/dashboard/overview?audience=portal");
      if (!overview.profile || !Array.isArray(overview.displays) || !Array.isArray(overview.content) || !Array.isArray(overview.campaigns)) {
        throw new Error("Das Kundenportal wird gerade eingerichtet. Bitte versuchen Sie es in Kürze erneut.");
      }
      if (!Array.isArray(overview.archivedContent)) overview.archivedContent = [];
      if (!Array.isArray(overview.serviceRequests)) overview.serviceRequests = [];
      if (!overview.customerRecords) overview.customerRecords = { quotes: [], projects: [], invoices: [] };
      if (!Array.isArray(overview.customerRecords.quotes)) overview.customerRecords.quotes = [];
      if (!Array.isArray(overview.customerRecords.projects)) overview.customerRecords.projects = [];
      if (!Array.isArray(overview.customerRecords.invoices)) overview.customerRecords.invoices = [];
      const collaboration = overview.projectCollaboration || {} as ProjectCollaboration;
      overview.projectCollaboration = { available: collaboration.available === true, briefings: Array.isArray(collaboration.briefings) ? collaboration.briefings : [], messages: Array.isArray(collaboration.messages) ? collaboration.messages : [], deliverables: Array.isArray(collaboration.deliverables) ? collaboration.deliverables : [], versions: Array.isArray(collaboration.versions) ? collaboration.versions : [], reviews: Array.isArray(collaboration.reviews) ? collaboration.reviews : [], revisions: Array.isArray(collaboration.revisions) ? collaboration.revisions : [] };
      const safety = overview.displaySafety || {} as DisplaySafety;
      overview.displaySafety = { versions: Array.isArray(safety.versions) ? safety.versions : [], tests: Array.isArray(safety.tests) ? safety.tests : [], alerts: Array.isArray(safety.alerts) ? safety.alerts : [] };
      const campaignVersions = overview.campaignVersions || {} as CampaignVersionsData;
      overview.campaignVersions = { available: campaignVersions.available === true, items: Array.isArray(campaignVersions.items) ? campaignVersions.items : [] };
      const partnerNetwork = overview.partnerNetwork || {} as PartnerNetworkData;
      overview.partnerNetwork = { available: partnerNetwork.available === true, partnerships: Array.isArray(partnerNetwork.partnerships) ? partnerNetwork.partnerships : [], offers: Array.isArray(partnerNetwork.offers) ? partnerNetwork.offers : [] };
      const campaignTemplates = overview.campaignTemplates || {} as CampaignTemplatesData;
      overview.campaignTemplates = { available: campaignTemplates.available === true, items: Array.isArray(campaignTemplates.items) ? campaignTemplates.items : [] };
      const displayGroups = overview.displayGroups || {} as DisplayGroupsData;
      overview.displayGroups = { available: displayGroups.available === true, items: Array.isArray(displayGroups.items) ? displayGroups.items : [] };
      setData(overview); setSession("ready");
      return overview;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Portal nicht erreichbar";
      if (message === "Nicht angemeldet") setSession("guest"); else { setSession("guest"); setError(message); }
      return null;
    }
  }, []);
  useEffect(() => {
    const hasProcessingVideo = data?.content.some((item) => item.content_type === "video" && item.payload?.processingState && !["ready", "error"].includes(item.payload.processingState));
    if (session !== "ready" || !hasProcessingVideo) return;
    const timer = window.setInterval(() => void load(false), 5_000);
    return () => window.clearInterval(timer);
  }, [data, load, session]);
  useEffect(() => {
    let active = true;
    void (async () => {
      const params = new URLSearchParams(location.search);
      const creditReturn = params.get("credits");
      if (!creditReturn) { await load(); return; }

      setView("content");
      setAiDialog(true);
      let notice: CreditPurchaseNotice;
      if (creditReturn === "cancelled") {
        notice = { tone: "info", title: "Kauf abgebrochen", detail: "Es wurden keine Credits berechnet. Sie können jederzeit ein anderes Paket wählen." };
      } else {
        const sessionId = params.get("checkout_session");
        if (sessionId) {
          try {
            const result = await api<CreditCheckoutResult>(`/api/dashboard/records?portalAi=credits&checkout_session=${encodeURIComponent(sessionId)}`);
            notice = result.paymentStatus === "paid"
              ? { tone: "success", title: `${result.purchase.credits} KI-Credits erfolgreich gekauft`, detail: `Neues Guthaben: ${result.balance?.available ?? "–"} Credits. Sie können direkt ein Bild erstellen.` }
              : { tone: "info", title: `${result.purchase.credits} KI-Credits werden gutgeschrieben`, detail: "Stripe verarbeitet die Zahlung noch. Das Guthaben erscheint automatisch nach der Bestätigung." };
          } catch (reason) {
            notice = { tone: "info", title: "Zahlung wird geprüft", detail: reason instanceof Error ? `${reason.message}. Bitte laden Sie die Seite in Kürze erneut.` : "Bitte laden Sie die Seite in Kürze erneut." };
          }
        } else {
          notice = { tone: "success", title: "Zahlung erfolgreich", detail: "Ihr Credit-Guthaben wurde aktualisiert. Sie können direkt ein Bild erstellen." };
        }
      }

      const overview = await load();
      if (!active) return;
      if (creditReturn === "success" && !params.get("checkout_session") && overview?.aiCredits.balance) {
        notice.detail = `Aktuelles Guthaben: ${overview.aiCredits.balance.available} Credits. Sie können direkt ein Bild erstellen.`;
      }
      setCreditNotice(notice);
      history.replaceState({}, "", `${location.pathname}${location.hash}`);
    })();
    return () => { active = false; };
  }, [load]);
  const online = useMemo(() => data?.displays?.filter((display) => display.status === "online").length || 0, [data]);
  if (session === "loading") return <div className="boot"><div className="boot-mark">SC</div><span>Portal wird geladen</span></div>;
  if (session === "guest" || !data) return <><Login onDone={() => void load()} />{error && <div className="global-message">{error}</div>}</>;
  const canEdit = data.profile.role !== "viewer";
  const canManageDevices = data.profile.role === "owner" || data.profile.role === "admin";
  const nav: Array<[View,string]> = [["overview","Übersicht"],["records","Meine Vorgänge"],["campaigns","Kampagnen"],["displays","Bildschirme"],["content","Medien & Vorlagen"],["partners","Partnernetzwerk"],["archive","Archiv"],["settings","Einstellungen"]];
  const primaryMobileViews: View[] = ["overview","campaigns","displays","content"];
  const secondaryNav = nav.filter(([id]) => !primaryMobileViews.includes(id));
  const onboardingComplete = data.campaigns.some((campaign) => ["active", "scheduled"].includes(campaign.status));
  const onboardingCampaign = [...data.campaigns]
    .filter((campaign) => ["draft", "paused"].includes(campaign.status))
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())[0];
  const onboardingStep: 1 | 2 | 3 | 4 = !onboardingCampaign
    ? 1
    : !(onboardingCampaign.display_links || []).length
      ? 1
      : !campaignHasContentForEveryDisplay(onboardingCampaign)
        ? 2
        : Math.min(4, Math.max(3, Number(onboardingCampaign.schedule?.portalSetupStep) || 4)) as 3 | 4;
  function openOnboardingStep() {
    if (!onboardingCampaign) {
      setCampaignInitialStep(1);
      setCampaignPreset(null);
      setCreatingCampaign(true);
      return;
    }
    setCampaignInitialStep(onboardingStep);
    setEditingCampaign(onboardingCampaign);
  }
  function startNewCampaign() {
    setCampaignQuickStart(true);
  }
  function useCampaignTemplate(choice: CampaignTemplateChoice) {
    if (!data) return;
    const availableDisplayIds = new Set(data.displays.map((display) => display.id));
    const availableContentIds = new Set(data.content.filter(contentIsDisplayReady).map((item) => item.id));
    const displayIds = (choice.displayIds || []).filter((id) => availableDisplayIds.has(id));
    const targetAssignments = (choice.targetAssignments || [])
      .filter((assignment) => displayIds.includes(assignment.displayId))
      .map((assignment) => ({ ...assignment, contentItems: (assignment.contentItems || []).filter((item) => availableContentIds.has(item.contentId)) }));
    const hierarchyPlaylists = Object.fromEntries(Object.entries(choice.hierarchyPlaylists || {}).map(([key, entries]) => [key, entries.filter((entry) => availableContentIds.has(entry.contentId))]));
    const completeTemplate = displayIds.length > 0 && displayIds.every((displayId) => targetAssignments.some((assignment) => assignment.displayId === displayId && assignment.contentItems.length > 0));
    const datedName = `${choice.name} · ${new Date().toLocaleDateString("de-CH")}`;
    setCampaignPreset({ ...choice, name: datedName, displayIds, targetAssignments, hierarchyPlaylists, startStep: completeTemplate ? 3 : 1, fromTemplate: true });
    setCampaignInitialStep(completeTemplate ? 3 : 1);
    setCampaignQuickStart(false);
    setCreatingCampaign(true);
  }
  async function logout() { await api("/api/dashboard/logout", { method: "POST", body: "{}" }).catch(() => undefined); setData(null); setSession("guest"); }
  async function setContentStatus(id: string, status: "approved" | "draft") {
    try {
      await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "update_content_status", id, status }) });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Status konnte nicht geändert werden"); }
  }
  async function changeContentArchive(id: string, action: "archive_content" | "restore_content") {
    if (archiveBusyId) return;
    setArchiveBusyId(id); setError("");
    try {
      await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action, id }) });
      await load(false);
      setView(action === "archive_content" ? "content" : "archive");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Der Archivstatus konnte nicht geändert werden");
    } finally {
      setArchiveBusyId("");
    }
  }
  function requestDelete(target: DeleteTarget) {
    setDeleteError("");
    setDeleteTarget(target);
  }
  async function confirmDelete() {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true); setDeleteError("");
    const action = deleteTarget.kind === "archived_content" ? "delete_content" : deleteTarget.kind === "campaign" ? "delete_campaign" : "delete_display";
    try {
      await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action, id: deleteTarget.id, confirmationName: deleteTarget.name }) });
      setDeleteTarget(null);
      await load();
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : "Der Eintrag konnte nicht gelöscht werden");
    } finally {
      setDeleteBusy(false);
    }
  }
  async function createPairing(display: Display) {
    if (pairingBusyId) return;
    setPairingBusyId(display.id);
    setError("");
    try {
      const result = await api<{ pairing: PairingInfo }>("/api/dashboard/records?audience=portal", {
        method: "POST",
        body: JSON.stringify({ action: "renew_display_pairing", id: display.id }),
      });
      setPairing({ ...result.pairing, displayName: display.name });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Aktivierungscode konnte nicht erstellt werden");
    } finally {
      setPairingBusyId("");
    }
  }
  async function waitForContentReady(id: string): Promise<Content> {
    const deadline = Date.now() + 15 * 60_000;
    while (Date.now() < deadline) {
      const overview = await load(false);
      const created = overview?.content.find((item) => item.id === id);
      if (created?.payload?.processingState === "error") {
        throw new Error(created.payload.processingError || `„${created.title}“ konnte nicht aufbereitet werden.`);
      }
      if (created && contentIsDisplayReady(created)) return created;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 3_000));
    }
    throw new Error("Das Video wurde gespeichert, benötigt aber länger als erwartet. Klicken Sie auf „Verfügbarkeit erneut prüfen“.");
  }
  return <div className="portal" style={{ "--accent": data.profile.branding?.accent || "#d90d32" } as React.CSSProperties}>
    <aside><a className="wordmark" href="/">Swiss<span>Compact</span></a><div className="tenant"><span>Arbeitsbereich</span><strong>{data.profile.tenantName}</strong></div>
      <nav>{nav.map(([id,label]) => <button key={id} className={`${view === id ? "active" : ""} ${primaryMobileViews.includes(id) ? "" : "nav-secondary"}`.trim()} onClick={() => setView(id)}><Icon name={id}/>{label}</button>)}<button type="button" className={`nav-more ${secondaryNav.some(([id]) => id === view) ? "active" : ""}`.trim()} onClick={() => setMobileMore(true)}><Icon name="more"/>Mehr</button></nav>
      <button className="logout" onClick={() => void logout()}><Icon name="logout"/>Abmelden</button>
      {mobileMore && <div className="dialog-backdrop mobile-more-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setMobileMore(false)}><section className="dialog mobile-more-sheet" role="dialog" aria-modal="true"><button className="dialog-close" onClick={() => setMobileMore(false)} aria-label="Schließen">×</button><div className="eyebrow">Mehr</div><div className="mobile-more-nav">{secondaryNav.map(([id,label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setMobileMore(false); }}><Icon name={id}/>{label}</button>)}</div><button type="button" className="logout mobile-more-logout" onClick={() => { setMobileMore(false); void logout(); }}><Icon name="logout"/>Abmelden</button></section></div>}
      {iosInstallHint && <div className="dialog-backdrop mobile-more-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setIosInstallHint(false)}><section className="dialog ios-install-dialog" role="dialog" aria-modal="true"><button className="dialog-close" onClick={() => setIosInstallHint(false)} aria-label="Schließen">×</button><div className="eyebrow">App installieren</div><h2>Zum Home-Bildschirm hinzufügen</h2><ol><li><Icon name="ios-share"/>Tippen Sie unten in Safari auf <b>Teilen</b>.</li><li><Icon name="plus"/>Wählen Sie <b>„Zum Home-Bildschirm“</b>.</li></ol></section></div>}
    </aside>
    <main className="workspace"><header><div><div className="eyebrow">{data.profile.tenantName}</div><h1>{nav.find(([id]) => id === view)?.[1]}</h1></div><div className="profile"><button type="button" className="pwa-install-button" data-pwa-install aria-label="App installieren"><Icon name="install"/><span>App installieren</span></button><span>{data.profile.displayName.slice(0,1).toUpperCase()}</span><div><strong>{data.profile.displayName}</strong><small>{labels[data.profile.role]}</small></div></div></header>
      {view === "overview" && <section className="view"><div className="welcome"><div><div className="eyebrow">Guten Tag, {data.profile.displayName.split(" ")[0]}</div><h2>Alles im Blick.</h2><p>Wählen Sie einen Bildschirm, fügen Sie Bild oder Video hinzu und bestimmen Sie den Zeitpunkt. Den Rest erledigt SwissCompact.</p>{canEdit && <button className="primary welcome-action" onClick={onboardingComplete ? startNewCampaign : openOnboardingStep}><Icon name="plus"/>{onboardingCampaign && !onboardingComplete ? "Einrichtung fortsetzen" : "Auf Bildschirm anzeigen"}</button>}</div><div className="pulse"><i></i>{online} von {data.displays.length} Bildschirmen online</div></div>
        <button className="customer-record-overview" onClick={() => setView("records")}><div><span>Ihre Zusammenarbeit mit SwissCompact</span><strong>Offerten, Aufträge und Rechnungen</strong><small>Alle Vorgänge und geschützten Dokumente an einem Ort.</small></div><div className="customer-record-overview-counts"><span><b>{data.customerRecords.quotes.filter((quote) => ["sent", "viewed"].includes(quote.status)).length}</b> offene Offerten</span><span><b>{data.customerRecords.projects.filter((project) => !["completed", "cancelled"].includes(project.status)).length}</b> laufende Aufträge</span><i>Öffnen →</i></div></button>
        <PortalOnboarding currentStep={onboardingStep} complete={onboardingComplete} campaignName={onboardingCampaign?.name} canEdit={canEdit} onContinue={openOnboardingStep} onStartNew={startNewCampaign}/>
        <div className="metrics"><article><span>Bildschirme</span><strong>{data.displays.length}</strong><small>{online} online</small></article><article><span>Medien</span><strong>{data.content.length}</strong><small>{data.content.filter((item) => item.status === "published").length} veröffentlicht</small></article><article><span>Kampagnen</span><strong>{data.campaigns.length}</strong><small>{data.campaigns.filter((item) => item.status === "active").length} aktiv</small></article><article><span>Standorte</span><strong>{data.sites.length}</strong><small>{data.sites.filter((item) => item.active).length} verbunden</small></article></div>
        <div className="split"><section className="card"><div className="card-head"><div><span>Aktuelle Kampagnen</span><h3>Planung & Ausspielung</h3></div><button onClick={() => setView("campaigns")}>Alle ansehen</button></div>{data.campaigns.length ? data.campaigns.slice(0,4).map((item) => <div className="row" key={item.id}><div><strong>{item.name}</strong><small>Aktualisiert {new Date(item.updated_at).toLocaleDateString("de-CH")} · Erstellt von {item.creator_name || "Nicht erfasst"}</small></div><Status value={item.status}/></div>) : <Empty>Noch keine Kampagnen vorhanden.</Empty>}</section>
          <section className="card"><div className="card-head"><div><span>Bildschirm-Status</span><h3>Ihre Flächen</h3></div><button onClick={() => setView("displays")}>Alle ansehen</button></div>{data.displays.length ? data.displays.slice(0,4).map((item) => <div className="row" key={item.id}><div><strong>{item.name}</strong><small>{item.site?.name || "Ohne Standort"} · Erstellt von {item.creator_name || "Nicht erfasst"}</small></div><Status value={item.status}/></div>) : <Empty>Noch keine Bildschirme verbunden.</Empty>}</section></div>
      </section>}
      {view === "content" && <section className="service-request-entry"><div className="service-request-intro"><div><span className="eyebrow">Persönliche Content-Produktion</span><h2>Von SwissCompact erstellen lassen</h2><p>Für Videoproduktionen, komplexe Kampagnen, Animationen und individuelle Inhalte, die über Upload und KI-Generator hinausgehen.</p></div>{canEdit && <button type="button" className="primary compact" onClick={() => setServiceRequestDialog(true)}>Produktion anfragen</button>}</div>{data.serviceRequests.length > 0 && <div className="service-request-list"><div className="service-request-list-head"><strong>Ihre Anfragen</strong><span>{data.serviceRequests.length}</span></div>{data.serviceRequests.slice(0, 4).map((item) => <article key={item.id}><div><small>{item.payload?.requestTypeLabel || "Individuelle Produktion"}</small><strong>{item.title}</strong><span>{item.payload?.desiredDate ? `Wunschtermin ${new Date(`${item.payload.desiredDate}T12:00:00`).toLocaleDateString("de-CH")}` : "Termin wird gemeinsam festgelegt"}</span></div><b>{serviceRequestStatusLabels[item.payload?.serviceRequestStatus || "submitted"] || "Eingegangen"}</b></article>)}</div>}</section>}
      {view === "content" && <section className="view"><div className="section-title"><div><h2>Medien & Vorlagen</h2><p>Alle Inhalte klar beschriftet, technisch geprüft und direkt zuweisbar.</p></div>{canEdit && <div className="content-create-actions"><button className="secondary compact ai-create" onClick={() => setAiDialog(true)}><span>✦</span>KI-Bild <b>{data.aiCredits?.balance?.available ?? "–"}</b></button><button className="primary compact" onClick={() => setDialog("content")}><Icon name="plus"/>Bild oder Video hochladen</button></div>}</div><div className="content-grid">{data.content.map((item) => { const usedBy = data.campaigns.filter((campaign) => (campaign.content_links || []).some((link) => link.content?.id === item.id) || (campaign.target_assignments || []).some((assignment) => assignment.content_links.some((link) => link.content?.id === item.id))); const displayReady = contentIsDisplayReady(item); const mediaDetails = mediaMetadataLabel(item.payload?.mediaMetadata); return <article className="content-card record-card" key={item.id}><div className={`content-preview type-${item.content_type}`}>{item.preview_url && item.content_type === "image" ? <img src={item.preview_url} alt="" loading="lazy"/> : (item.poster_url || item.preview_url) && item.content_type === "video" ? <img src={item.poster_url || item.preview_url || ""} alt="" loading="lazy"/> : null}<span>{contentProcessingLabel(item)}</span></div><div><span className="record-kind">Inhalt · {item.content_type === "image" ? "Bild" : item.content_type === "video" ? "Video" : item.content_type}</span><div className="record-title-line"><h3>{item.title}</h3><Status value={item.status}/></div><p className={item.payload?.processingState === "error" ? "media-processing-error" : ""}>{item.payload?.processingError || item.payload?.text || mediaDetails || (item.content_type === "image" ? "Bildmedium" : item.content_type === "video" ? "Videomedium" : "Noch keine Beschreibung")}</p><div className="record-assignment"><span>Verwendung</span><strong>{usedBy.length ? usedBy.map((campaign) => campaign.name).join(", ") : "Noch keiner Kampagne zugeordnet"}</strong></div><small>Geändert {new Date(item.updated_at).toLocaleDateString("de-CH")}</small><small className="creator-meta">Erstellt von {item.creator_name || "Nicht erfasst"}</small>{canEdit && <div className="record-actions">{displayReady && <button type="button" className="assign-record-action" onClick={() => { setCampaignPreset({ contentId: item.id }); setCreatingCampaign(true); }}>Auf Bildschirm anzeigen</button>}<button type="button" className="edit-record-action" onClick={() => setEditingContent(item)}>Bearbeiten</button>{displayReady && <button className="content-status-action" onClick={() => void setContentStatus(item.id, ["approved", "published"].includes(item.status) ? "draft" : "approved")}>{["approved", "published"].includes(item.status) ? "Freigabe zurückziehen" : "Für Bildschirme freigeben"}</button>}<button type="button" className="delete-record-action" disabled={archiveBusyId === item.id} onClick={() => void changeContentArchive(item.id, "archive_content")}>{archiveBusyId === item.id ? "Wird archiviert …" : "Archivieren"}</button></div>}</div></article>; })}{!data.content.length && <Empty>Fügen Sie Ihr erstes Bild, Video oder eine Vorlage hinzu.</Empty>}</div></section>}
      {view === "archive" && <section className="view"><div className="section-title"><div><h2>Medienarchiv</h2><p>Aufbewahrte Bilder, Videos und generierte Inhalte können wiederverwendet oder endgültig gelöscht werden.</p></div><span className="archive-count">{data.archivedContent.length} {data.archivedContent.length === 1 ? "Inhalt" : "Inhalte"}</span></div><div className="content-grid">{data.archivedContent.map((item) => <article className="content-card record-card archived-content-card" key={item.id}><div className={`content-preview type-${item.content_type}`}>{item.preview_url && item.content_type === "image" ? <img src={item.preview_url} alt="" loading="lazy"/> : (item.poster_url || item.preview_url) && item.content_type === "video" ? <img src={item.poster_url || item.preview_url || ""} alt="" loading="lazy"/> : null}<span>{item.content_type.toUpperCase()}</span></div><div><span className="record-kind">Archiv · {item.content_type === "image" ? "Bild" : item.content_type === "video" ? "Video" : item.content_type}</span><div className="record-title-line"><h3>{item.title}</h3><Status value="archived"/></div><p>{item.payload?.text || mediaMetadataLabel(item.payload?.mediaMetadata) || (item.content_type === "image" ? "Bildmedium" : item.content_type === "video" ? "Videomedium" : "Archivierter Inhalt")}</p><div className="record-assignment"><span>Verwendung</span><strong>Im Archiv sicher aufbewahrt</strong></div><small>Archiviert {new Date(item.updated_at).toLocaleDateString("de-CH")}</small><small className="creator-meta">Erstellt von {item.creator_name || "Nicht erfasst"}</small>{canEdit && <div className="record-actions"><button type="button" className="restore-record-action" disabled={archiveBusyId === item.id} onClick={() => void changeContentArchive(item.id, "restore_content")}>{archiveBusyId === item.id ? "Wird wiederhergestellt …" : "Wiederherstellen"}</button><button type="button" className="delete-record-action" onClick={() => requestDelete({ kind: "archived_content", id: item.id, name: item.title })}>Endgültig löschen</button></div>}</div></article>)}{!data.archivedContent.length && <Empty>Das Archiv ist leer. Archivierte Medien erscheinen hier und bleiben für später erhalten.</Empty>}</div></section>}
      {view === "campaigns" && <section className="view">
        <div className="section-title"><div><h2>Kampagnen</h2><p>Mit einem Schnellstart beginnen oder bestehende Ausspielungen wiederverwenden.</p></div>{canEdit && <button className="primary compact" onClick={() => setCampaignQuickStart(true)}><Icon name="plus"/>Schnellstart</button>}</div>
        {canEdit && <button type="button" className="campaign-quickstart-banner" onClick={() => setCampaignQuickStart(true)}><b>In wenigen Schritten zur fertigen Anzeige</b><span>Wochenangebot, Aktion, Information, Partnerwerbung oder Ihre eigene Vorlage wählen.</span><i>Vorlage wählen →</i></button>}
        <div className="table-card"><div className="table-head campaign-table"><span>Ausspielung</span><span>Laufzeit</span><span>Verantwortlich</span><span>Status</span><span>Aktionen</span></div>{data.campaigns.map((item) => {
          const contentIds = new Set([...(item.content_links || []).flatMap((link) => link.content?.id ? [link.content.id] : []), ...(item.target_assignments || []).flatMap((assignment) => assignment.content_links.flatMap((link) => link.content?.id ? [link.content.id] : []))]);
          const scope = item.scope_area_id ? data.areas.find((area) => area.id === item.scope_area_id)?.name : item.scope_site_id ? data.sites.find((site) => site.id === item.scope_site_id)?.name : "Alle Standorte";
          const complete = Boolean(item.display_links?.length && campaignHasContentForEveryDisplay(item));
          return <div className="table-row campaign-table" key={item.id}><div className="campaign-identity"><span className="record-kind">Ausspielung</span><strong>{item.name}</strong><small>{item.theme || "Automatisch eingerichtet"}</small><small>{scope || "Ohne Einordnung"} · {item.display_links?.length || 0} {(item.display_links?.length || 0) === 1 ? "Bildschirm" : "Bildschirme"} · {contentIds.size} {contentIds.size === 1 ? "Inhalt" : "Inhalte"}</small></div><span>{item.starts_at ? new Date(item.starts_at).toLocaleDateString("de-CH") : "Sofort"} – {item.ends_at ? new Date(item.ends_at).toLocaleDateString("de-CH") : "Ohne Ende"}</span><span className="creator-meta">{item.creator_name || "Nicht erfasst"}</span><Status value={item.status}/><div className="campaign-row-actions"><button className="assign-record-action" onClick={() => { setCampaignInitialStep(1); setEditingCampaign(item); }}>Bildschirme ändern</button><button className="row-action" onClick={() => { setCampaignInitialStep(4); setEditingCampaign(item); }}>{canEdit ? "Prüfen & bearbeiten" : "Ansehen"}</button>{data.campaignVersions.available && <button type="button" className="campaign-version-record-action" onClick={() => setVersionCampaign(item)}>Versionen</button>}{canEdit && complete && <button type="button" className="template-record-action" onClick={() => setTemplateCampaign(item)}>Als Vorlage speichern</button>}{canEdit && <button type="button" className="delete-record-action" onClick={() => requestDelete({ kind: "campaign", id: item.id, name: item.name })}>Löschen</button>}</div></div>;
        })}{!data.campaigns.length && <Empty>Starten Sie mit einer verständlichen Vorlage Ihre erste Anzeige.</Empty>}</div>
      </section>}
      {view === "displays" && <DisplayManagementView
        displays={data.displays}
        groups={data.displayGroups}
        sites={data.sites}
        content={data.content}
        canEdit={canEdit}
        canManageDevices={canManageDevices}
        pairingBusyId={pairingBusyId}
        campaignNames={(displayId) => data.campaigns.filter((campaign) => (campaign.display_links || []).some((link) => link.display_id === displayId)).map((campaign) => campaign.name)}
        renderPreview={(display) => <DisplayPreview display={display as Display} campaigns={data.campaigns} content={data.content}/>}
        renderStatus={(status) => <Status value={status}/>}
        onCreate={() => setDisplaySetup("standalone")}
        onCampaign={(displayIds) => {
          setCampaignPreset(displayIds.length === 1 ? { displayId: displayIds[0] } : { displayIds, startStep: 2 });
          setCampaignInitialStep(displayIds.length === 1 ? 1 : 2);
          setCreatingCampaign(true);
        }}
        onEdit={(display) => setEditingDisplay(display as Display)}
        onPair={(display) => void createPairing(display as Display)}
        onDelete={(display) => requestDelete({ kind: "display", id: display.id, name: display.name })}
        onReload={async () => { await load(false); }}
      />}
      {view === "partners" && <PartnerNetworkView
        network={data.partnerNetwork}
        content={data.content}
        role={data.profile.role}
        onChanged={async () => { await load(false); }}
        onUseContent={(contentId) => { setCampaignPreset({ contentId }); setCampaignInitialStep(1); setCreatingCampaign(true); }}
      />}
      {view === "settings" && <section className="view"><div className="section-title"><div><h2>Konto & Service</h2><p>Ihr Portalzugang und das aktive SwissCompact-Paket.</p></div></div><div className="settings-grid"><article className="card plan"><span>Aktives Paket</span><h3>{data.subscription?.package_code || "Noch nicht zugewiesen"}</h3><Status value={data.subscription?.status || "paused"}/><p>Software, Portal, Wartung, Fehlerbehebung und kleinere Anpassungen – zentral betreut durch SwissCompact.</p>{data.subscription?.minimum_ends_on && <small>Mindestlaufzeit bis {new Date(data.subscription.minimum_ends_on).toLocaleDateString("de-CH")}</small>}</article><article className="card"><span>Portalzugänge</span><h3>{data.members.length} Benutzer</h3>{data.members.map((member) => <div className="row" key={member.id}><strong>{member.display_name || "Portalbenutzer"}</strong><span>{labels[member.role] || member.role}</span></div>)}</article><article className="card support"><span>SwissCompact Support</span><h3>Wir sind für Sie da.</h3><p>Für technische Fragen, neue Displays oder Unterstützung bei Ihren Inhalten.</p><a href="mailto:kontakt@swisscompact.com">kontakt@swisscompact.com</a></article></div></section>}
      {view === "records" && <CustomerRecordsView data={data} onRefresh={async () => { await load(false); }}/>}
    </main>
    {dialog && <CreateDialog type={dialog} initialContentType={dialog === "content" ? "image" : "composition"} waitUntilReady={waitForContentReady} onClose={() => setDialog(null)} onCreated={() => { setDialog(null); void load(); }} />}
    {serviceRequestDialog && <ServiceRequestDialog profile={data.profile} onClose={() => setServiceRequestDialog(false)} onCreated={() => { setServiceRequestDialog(false); void load(false); }} />}
    {editingContent && <ContentEditDialog content={editingContent} onClose={() => setEditingContent(null)} onUpload={() => { setEditingContent(null); setDialog("content"); }} onSaved={() => { setEditingContent(null); void load(); }} />}
    {aiDialog && <AiImageDialog credits={data.aiCredits} canBuy={canManageDevices} checkoutNotice={creditNotice} onDismissCheckoutNotice={() => setCreditNotice(null)} onClose={() => setAiDialog(false)} onCreated={() => { setAiDialog(false); void load(); }} />}
    {campaignQuickStart && <CampaignQuickStartDialog templates={data.campaignTemplates} onChoose={useCampaignTemplate} onClose={() => setCampaignQuickStart(false)} onChanged={async () => { await load(false); }} />}
    {templateCampaign && <SaveCampaignTemplateDialog campaignId={templateCampaign.id} campaignName={templateCampaign.name} onClose={() => setTemplateCampaign(null)} onSaved={async () => { await load(false); }} />}
    {versionCampaign && <CampaignVersionHistoryDialog campaign={versionCampaign} history={data.campaignVersions} canEdit={canEdit} onClose={() => setVersionCampaign(null)} onRestore={async (versionId) => { await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "restore_campaign_version", id: versionCampaign.id, versionId }) }); await load(false); setVersionCampaign(null); }} />}
    {(creatingCampaign || editingCampaign) && <CampaignEditor campaign={editingCampaign} preset={editingCampaign ? null : campaignPreset} initialStep={campaignInitialStep} sites={data.sites} areas={data.areas} content={data.content} displays={data.displays} displayGroups={data.displayGroups} aiCredits={data.aiCredits} canEdit={canEdit} canManageDevices={canManageDevices} onWaitForContentReady={waitForContentReady} onContentCreated={async (id) => {
      const next = await load(false);
      return next?.content.find((item) => item.id === id) || null;
    }} onDraftCreated={() => load(false)} onCreateDisplay={() => setDisplaySetup("campaign")} onClose={() => { setCreatingCampaign(false); setEditingCampaign(null); setCampaignPreset(null); setCampaignInitialStep(1); setDeferredPairings([]); void load(false); }} onSaved={() => { if (campaignPreset?.fromTemplate) setView("campaigns"); else if (campaignPreset) setView("displays"); setCreatingCampaign(false); setEditingCampaign(null); setCampaignPreset(null); setCampaignInitialStep(1); if (deferredPairings.length) { setPairing(deferredPairings[0]); setDeferredPairings((current) => current.slice(1)); } void load(); }} />}
    {displaySetup && <DisplaySetupDialog sites={data.sites} areas={data.areas} deferActivation={displaySetup === "campaign"} onClose={() => setDisplaySetup(null)} onCreated={(next) => { const source = displaySetup; setDisplaySetup(null); if (source === "campaign") { setDeferredPairings((current) => [...current, next]); void load(false); } else { setPairing(next); void load(); } }} />}
    {editingDisplay && <DisplayEditDialog display={editingDisplay} sites={data.sites} areas={data.areas} onClose={() => setEditingDisplay(null)} onSaved={() => { setEditingDisplay(null); void load(); }} />}
    {safetyDisplay && <DisplaySafetyDialog display={safetyDisplay} campaigns={data.campaigns} content={data.content} safety={data.displaySafety} canEdit={canEdit} onClose={() => setSafetyDisplay(null)} onChanged={async () => { const next = await load(false); const refreshed = next?.displays.find((item) => item.id === safetyDisplay.id); if (refreshed) setSafetyDisplay(refreshed); }} />}
    {pairing && <PairingDialog pairing={pairing} onClose={() => { if (deferredPairings.length) { setPairing(deferredPairings[0]); setDeferredPairings((current) => current.slice(1)); } else setPairing(null); }} />}
    {deleteTarget && <DeleteDialog key={`${deleteTarget.kind}-${deleteTarget.id}`} target={deleteTarget} busy={deleteBusy} error={deleteError} onCancel={() => !deleteBusy && setDeleteTarget(null)} onConfirm={() => void confirmDelete()} />}
    {error && <div className="global-message" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Meldung schließen">×</button></div>}
  </div>;
}

function ServiceRequestDialog({ profile, onClose, onCreated }: { profile: PortalProfile; onClose: () => void; onCreated: () => void }) {
  const [requestType, setRequestType] = useState("complex_campaign");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({
        action: "create_service_request",
        requestType,
        title: form.get("title"),
        objective: form.get("objective"),
        deliverables: form.get("deliverables"),
        desiredDate: form.get("desiredDate"),
        budget: form.get("budget"),
      }) });
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Produktionsanfrage konnte nicht gesendet werden");
    } finally {
      setBusy(false);
    }
  }
  return <div className="dialog-backdrop service-request-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}><section className="dialog service-request-dialog" role="dialog" aria-modal="true" aria-labelledby="service-request-title"><button className="dialog-close" onClick={onClose} disabled={busy} aria-label="Schließen">×</button><div className="eyebrow">SwissCompact Content-Service</div><h2 id="service-request-title">Was dürfen wir für Sie produzieren?</h2><p>Beschreiben Sie kurz Ihr Ziel. Wir prüfen die Anfrage persönlich und melden uns für Konzept, Aufwand und Offerte bei Ihnen.</p><form onSubmit={submit}><label>Art der Produktion<select value={requestType} onChange={(event) => setRequestType(event.target.value)}><option value="complex_campaign">Komplexe Kampagne</option><option value="video_production">Videoproduktion</option><option value="motion_design">Animation & Motion Design</option><option value="custom_content">Individuelle Bilder & Inhalte</option><option value="concept_strategy">Konzept & Inhaltsstrategie</option><option value="other">Andere Produktion</option></select></label><label>Projekt- oder Kampagnenname<input name="title" required autoFocus maxLength={180} placeholder="z. B. Weihnachtskampagne Filialen 2026"/></label><label>Was möchten Sie erreichen?<textarea name="objective" required rows={5} maxLength={5000} placeholder="Ziel, Zielgruppe, Stimmung, Botschaft und Einsatzort …"/></label><label>Gewünschter Umfang<textarea name="deliverables" rows={4} maxLength={5000} placeholder="z. B. Kampagnenkonzept, 3 Videos in Hoch- und Querformat, Fotos und Anpassungen für 8 Bildschirme"/></label><div className="service-request-pair"><label>Wunschtermin<input name="desiredDate" type="date"/></label><label>Budgetrahmen<select name="budget" defaultValue=""><option value="">Noch offen</option><option value="bis CHF 1'000">Bis CHF 1'000</option><option value="CHF 1'000–3'000">CHF 1'000–3'000</option><option value="CHF 3'000–10'000">CHF 3'000–10'000</option><option value="über CHF 10'000">Über CHF 10'000</option></select></label></div><div className="service-request-contact"><span>Kontakt für Rückfragen</span><strong>{profile.displayName}</strong><small>{profile.email}</small></div><div className="service-request-note"><strong>Unverbindliche Anfrage</strong><span>Mit dem Absenden entsteht noch kein kostenpflichtiger Auftrag. Sie erhalten zuerst eine persönliche Rückmeldung und bei Bedarf eine Offerte.</span></div>{error && <div className="form-error" role="alert">{error}</div>}<footer><button type="button" className="secondary" onClick={onClose} disabled={busy}>Abbrechen</button><button className="primary" disabled={busy}>{busy ? "Anfrage wird gesendet …" : "Anfrage an SwissCompact senden"}</button></footer></form></section></div>;
}

function DeleteDialog({ target, busy, error, onCancel, onConfirm }: { target: DeleteTarget; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void }) {
  const [stage, setStage] = useState<1 | 2>(1);
  const labelsByKind = {
    archived_content: { eyebrow: "Archivierten Inhalt löschen", noun: "Inhalt", detail: "Die Mediendatei wird endgültig aus dem Archiv und aus dem Speicher entfernt. Danach kann sie nicht mehr wiederhergestellt werden." },
    campaign: { eyebrow: "Kampagne löschen", noun: "Kampagne", detail: "Die Kampagne sowie ihre Inhalts- und Bildschirm-Zuordnungen werden dauerhaft gelöscht. Bilder und Videos bleiben in Medien & Vorlagen erhalten und können später erneut verwendet werden." },
    display: { eyebrow: "Bildschirm löschen", noun: "Bildschirm", detail: "Der Bildschirm, seine Geräteverbindung und alle Kampagnen-Zuordnungen werden dauerhaft entfernt. Zugewiesene Bilder und Videos bleiben in Medien & Vorlagen erhalten." },
  } as const;
  const copy = labelsByKind[target.kind];
  return <div className="dialog-backdrop delete-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}><section className="dialog delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title"><button className="dialog-close" onClick={onCancel} disabled={busy} aria-label="Schließen">×</button><div className="eyebrow">{copy.eyebrow} · Bestätigung {stage} von 2</div><h2 id="delete-dialog-title">{stage === 1 ? `„${target.name}“ wirklich löschen?` : `„${target.name}“ endgültig löschen?`}</h2>{stage === 1 ? <><p>{copy.detail}</p><div className="delete-warning"><strong>Diese Aktion kann nicht rückgängig gemacht werden.</strong><span>{copy.noun} und zugehörige Verknüpfungen werden endgültig entfernt.</span></div></> : <><p>Bitte bestätigen Sie ein zweites Mal, dass Sie diesen Eintrag wirklich löschen möchten.</p><div className="delete-warning"><strong>Letzte Bestätigung</strong><span>Mit dem nächsten Klick wird „{target.name}“ endgültig gelöscht.</span></div></>}{error && <div className="form-error" role="alert">{error}</div>}<footer className="delete-dialog-actions"><button type="button" className="secondary" onClick={stage === 1 ? onCancel : () => setStage(1)} disabled={busy}>{stage === 1 ? "Abbrechen" : "Zurück"}</button>{stage === 1 ? <button type="button" className="delete-confirm" onClick={() => setStage(2)}>Ja, weiter zur zweiten Bestätigung</button> : <button type="button" className="delete-confirm" onClick={onConfirm} disabled={busy}>{busy ? "Wird gelöscht …" : `Ja, ${copy.noun.toLowerCase()} endgültig löschen`}</button>}</footer></section></div>;
}

function ContentEditDialog({ content, onClose, onUpload, onSaved }: { content: Content; onClose: () => void; onUpload: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "update_content", id: content.id, title: form.get("title"), text: form.get("text") }) });
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Inhalt konnte nicht gespeichert werden"); }
    finally { setBusy(false); }
  }
  const hasMediaFile = content.content_type === "image" || content.content_type === "video";
  const contentTypeLabel = content.content_type === "image" ? "Bild" : content.content_type === "video" ? "Video" : content.content_type === "composition" ? "Entwurf ohne Mediendatei" : content.content_type;
  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}><section className="dialog record-edit-dialog" role="dialog" aria-modal="true"><button className="dialog-close" onClick={onClose} disabled={busy} aria-label="Schließen">×</button><div className="eyebrow">Inhalt bearbeiten</div><h2>{content.title}</h2><form onSubmit={submit}><label>Titel<input name="title" required autoFocus defaultValue={content.title}/></label><label>Beschreibung oder Text<textarea name="text" rows={5} defaultValue={content.payload?.text || ""} placeholder="Kurze, verständliche Beschreibung des Inhalts"/></label><div className="record-edit-readonly"><span>Inhaltstyp</span><strong>{contentTypeLabel}</strong><span>Status</span><strong>{labels[content.status] || content.status}</strong></div>{!hasMediaFile && <div className="editor-notice media-missing-notice"><strong>Noch keine Bild- oder Videodatei vorhanden.</strong><span>Laden Sie jetzt ein Bild oder Video als neuen Medieninhalt hoch. Diesen leeren Entwurf können Sie danach archivieren.</span><button type="button" className="secondary" onClick={onUpload} disabled={busy}>Bild oder Video hochladen</button></div>}{error && <div className="form-error" role="alert">{error}</div>}<footer className="record-edit-actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>Abbrechen</button><button className="primary" disabled={busy}>{busy ? "Wird gespeichert …" : "Änderungen speichern"}</button></footer></form></section></div>;
}

function DisplayEditDialog({ display, sites, areas, onClose, onSaved }: { display: Display; sites: Site[]; areas: Area[]; onClose: () => void; onSaved: () => void }) {
  const [siteId, setSiteId] = useState(display.site_id || sites[0]?.id || "");
  const [areaId, setAreaId] = useState(display.area_id || "");
  const [orientation, setOrientation] = useState(display.orientation || "landscape");
  const [screenSizeInches, setScreenSizeInches] = useState(display.screen_size_inches ? String(display.screen_size_inches) : "");
  const [panelTechnology, setPanelTechnology] = useState(display.panel_technology || "auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const availableAreas = areas.filter((area) => area.active && area.site_id === siteId);
  const sizeDimensions = screenSizeInches ? DISPLAY_SIZE_LANDSCAPE_CM[Number(screenSizeInches)] : null;
  const dimensionHint = sizeDimensions
    ? orientation === "portrait"
      ? `≈ ${sizeDimensions.height} × ${sizeDimensions.width} cm`
      : `≈ ${sizeDimensions.width} × ${sizeDimensions.height} cm`
    : "";
  const showLedHint = panelTechnology === "auto" && Number(screenSizeInches) >= LED_AUTO_THRESHOLD_INCHES;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "update_display", id: display.id, name: form.get("name"), siteId, areaId: areaId || null, kind: form.get("kind"), orientation, screenSizeInches: screenSizeInches ? Number(screenSizeInches) : null, panelTechnology, useCategory: form.get("useCategory") || null }) });
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Bildschirm konnte nicht gespeichert werden"); }
    finally { setBusy(false); }
  }
  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}><section className="dialog record-edit-dialog" role="dialog" aria-modal="true"><button className="dialog-close" onClick={onClose} disabled={busy} aria-label="Schließen">×</button><div className="eyebrow">Bildschirm bearbeiten</div><h2>{display.name}</h2><form onSubmit={submit}><label>Bildschirmname<input name="name" required autoFocus defaultValue={display.name}/></label><div className="date-pair"><label>Gerätetyp<select name="kind" defaultValue={display.kind || "display"}><option value="display">Bildschirm</option><option value="led_wall">LED-Wand</option><option value="led_controller">LED-Controller</option><option value="player">Player</option></select></label><label>Ausrichtung<select name="orientation" value={orientation} onChange={(event) => setOrientation(event.target.value)}><option value="landscape">Querformat</option><option value="portrait">Hochformat</option><option value="custom">Individuell</option></select></label></div><div className="date-pair"><label>Displaygrösse<select name="screenSizeInches" value={screenSizeInches} onChange={(event) => setScreenSizeInches(event.target.value)}><option value="">Nicht festgelegt</option><option value="22">22″</option><option value="24">24″</option><option value="27">27″</option><option value="32">32″</option><option value="55">55″</option><option value="65">65″</option><option value="75">75″</option></select>{dimensionHint && <span className="field-hint">{dimensionHint}</span>}</label><label>Bildtechnologie<select name="panelTechnology" value={panelTechnology} onChange={(event) => setPanelTechnology(event.target.value)}><option value="auto">Automatisch</option><option value="display">Display</option><option value="led">LED-Fläche</option></select>{showLedHint && <span className="field-hint">Ab {LED_AUTO_THRESHOLD_INCHES}″ wird automatisch eine LED-Wand empfohlen.</span>}</label></div><label>Verwendungszweck<select name="useCategory" defaultValue={display.use_category || ""}><option value="">Nicht festgelegt</option><option value="menu">Menü / Angebote</option><option value="promotion">Werbung / Kampagne</option><option value="wayfinding">Orientierung / Wegweiser</option></select></label><label>Standort<select required value={siteId} onChange={(event) => { setSiteId(event.target.value); setAreaId(""); }}>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label><label>Stockwerk / Bereich<select value={areaId} onChange={(event) => setAreaId(event.target.value)}><option value="">Keine weitere Zuordnung</option>{availableAreas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label>{error && <div className="form-error" role="alert">{error}</div>}<footer className="record-edit-actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>Abbrechen</button><button className="primary" disabled={busy}>{busy ? "Wird gespeichert …" : "Änderungen speichern"}</button></footer></form></section></div>;
}

function DisplaySetupDialog({ sites, areas, deferActivation = false, onClose, onCreated }: { sites: Site[]; areas: Area[]; deferActivation?: boolean; onClose: () => void; onCreated: (pairing: PairingInfo) => void }) {
  const [siteMode, setSiteMode] = useState(sites.length ? "existing" : "new");
  const [siteId, setSiteId] = useState(sites[0]?.id || "");
  const [areaMode, setAreaMode] = useState<"none" | "existing" | "new">("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const siteAreas = areas.filter((area) => area.site_id === siteId && area.active);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      let targetSiteId = String(form.get("siteId") || "");
      if (siteMode === "new") {
        const site = await api<{ record: Site }>("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "create_site", name: form.get("siteName") }) });
        targetSiteId = site.record.id;
      }
      let areaId = areaMode === "existing" && siteMode === "existing" ? String(form.get("areaId") || "") : "";
      if (areaMode === "new") {
        const area = await api<{ record: Area }>("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "create_area", siteId: targetSiteId, name: form.get("areaName"), kind: form.get("areaKind") }) });
        areaId = area.record.id;
      }
      const display = await api<{ record: { name: string }; pairing: PairingInfo }>("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "create_display", name: form.get("name"), siteId: targetSiteId, areaId: areaId || null, kind: form.get("kind"), orientation: form.get("orientation") }) });
      onCreated({ ...display.pairing, displayName: display.record.name });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Bildschirm konnte nicht eingerichtet werden"); }
    finally { setBusy(false); }
  }
  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}><section className="dialog" role="dialog" aria-modal="true"><button className="dialog-close" onClick={onClose} disabled={busy}>×</button><div className="eyebrow">Geräteverwaltung</div><h2>Bildschirm einrichten</h2><form onSubmit={submit}><label>Bildschirmname<input name="name" required autoFocus placeholder="z. B. Schaufenster links"/></label><div className="date-pair"><label>Gerätetyp<select name="kind"><option value="display">Bildschirm</option><option value="led_wall">LED-Wand</option><option value="led_controller">LED-Controller</option><option value="player">Player</option></select></label><label>Ausrichtung<select name="orientation"><option value="landscape">Querformat</option><option value="portrait">Hochformat</option><option value="custom">Individuell</option></select></label></div>{sites.length > 0 && <label>Standorttyp<select value={siteMode} onChange={(event) => { const mode = event.target.value; setSiteMode(mode); if (mode === "new" && areaMode === "existing") setAreaMode("none"); }}><option value="existing">Bestehender Standort</option><option value="new">Neuer Standort</option></select></label>}{siteMode === "existing" ? <label>Standort<select name="siteId" required value={siteId} onChange={(event) => { setSiteId(event.target.value); setAreaMode("none"); }}>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label> : <label>Neuer Standort<input name="siteName" required placeholder="z. B. Warenhaus Zürich oder Filiale Bern"/></label>}<label>Stockwerk oder Bereich <small>Optional – hilfreich bei mehreren Bildschirmen</small><select value={areaMode} onChange={(event) => setAreaMode(event.target.value as "none" | "existing" | "new")}><option value="none">Keine weitere Zuordnung</option>{siteMode === "existing" && siteAreas.length > 0 && <option value="existing">Bestehenden Bereich wählen</option>}<option value="new">Neues Stockwerk / neuen Bereich anlegen</option></select></label>{areaMode === "existing" && siteMode === "existing" && <label>Bereich<select name="areaId" required>{siteAreas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label>}{areaMode === "new" && <div className="date-pair"><label>Name<input name="areaName" required placeholder="z. B. 1. Stock oder Damenmode"/></label><label>Typ<select name="areaKind"><option value="floor">Stockwerk</option><option value="area">Bereich</option><option value="zone">Zone</option><option value="building">Gebäude</option></select></label></div>}{deferActivation && <div className="editor-notice"><strong>Zuerst fertig konfigurieren</strong><span>Der QR-Code zur Geräteverbindung erscheint erst nach dem Abschluss der Kampagne.</span></div>}{error && <div className="form-error">{error}</div>}<button className="primary" disabled={busy}>{busy ? "Wird vorbereitet …" : "Bildschirm vorbereiten"}</button></form></section></div>;
}

function PairingDialog({ pairing, onClose }: { pairing: PairingInfo; onClose: () => void }) {
  const playerUrl = `${location.origin}/player?display=${encodeURIComponent(pairing.displayId)}&pair=1`;
  const [copied, setCopied] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const qrPlayerUrl = `${playerUrl}&code=${encodeURIComponent(pairing.code)}&connect=1`;
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(qrPlayerUrl, { width: 360, margin: 1, errorCorrectionLevel: "M", color: { dark: "#111113", light: "#ffffff" } }).then((url) => { if (active) setQrCode(url); });
    return () => { active = false; };
  }, [qrPlayerUrl]);
  async function copy() { await navigator.clipboard.writeText(`Bildschirm-ID: ${pairing.displayId}\nAktivierungscode: ${pairing.code}\nPlayer-Adresse: ${playerUrl}`); setCopied(true); }
  return <div className="dialog-backdrop"><section className="dialog pairing-result" role="dialog" aria-modal="true"><button className="dialog-close" onClick={onClose}>×</button><div className="eyebrow">Bildschirm verbinden</div><h2>{pairing.displayName || "Bildschirm"}</h2><p>Scannen Sie den QR-Code auf dem Abspielgerät oder übertragen Sie die beiden Angaben in dieser Reihenfolge.</p><div className="pairing-connect-grid"><div className="pairing-manual"><div className="pairing-field"><span>1 · Bildschirm-ID</span><code>{pairing.displayId}</code></div><div className="pairing-field"><span>2 · Aktivierungscode</span><strong className="pairing-code">{pairing.code}</strong></div></div><div className="pairing-qr"><span>Schnell verbinden</span>{qrCode ? <img src={qrCode} alt="QR-Code zur automatischen Verbindung des Bildschirms"/> : <div className="pairing-qr-loading">QR-Code wird erstellt …</div>}<small>Mit der Kamera des Abspielgeräts scannen</small></div></div><div className="pairing-meta"><span>Player-Adresse für manuelle Eingabe</span><a href={playerUrl} target="_blank" rel="noreferrer">{playerUrl}</a></div><div className="pairing-result-actions"><button className="primary" onClick={() => void copy()}>{copied ? "Kopiert" : "Angaben kopieren"}</button></div><small>Der Aktivierungscode ist bis {new Date(pairing.expiresAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })} Uhr gültig und kann nur einmal verwendet werden.</small></section></div>;
}

function localDateTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

type PlaylistEntry = { contentId: string; durationSeconds: number };
type CampaignContentMode = "shared" | "hierarchy" | "individual";

function CampaignEditor({ campaign, preset, initialStep, sites, areas, content, displays, displayGroups, aiCredits, canEdit, canManageDevices, onContentCreated, onWaitForContentReady, onDraftCreated, onCreateDisplay, onClose, onSaved }: { campaign: Campaign | null; preset: CampaignPreset | null; initialStep: 1 | 2 | 3 | 4; sites: Site[]; areas: Area[]; content: Content[]; displays: Display[]; displayGroups: DisplayGroupsData; aiCredits: AiCredits; canEdit: boolean; canManageDevices: boolean; onContentCreated: (id: string) => Promise<Content | null>; onWaitForContentReady: (id: string) => Promise<Content>; onDraftCreated: () => Promise<PortalData | null>; onCreateDisplay: () => void; onClose: () => void; onSaved: () => void }) {
  const legacyPlaylist = [...(campaign?.content_links || [])].sort((a,b) => a.position - b.position).flatMap((link) => link.content ? [{ contentId: link.content.id, durationSeconds: link.duration_seconds || 10 }] : []);
  const initialTargetPlaylists = Object.fromEntries((campaign?.target_assignments || []).map((assignment) => [assignment.display_id, [...assignment.content_links].sort((a,b) => a.position - b.position).flatMap((link) => link.content ? [{ contentId: link.content.id, durationSeconds: link.duration_seconds || 10 }] : [])])) as Record<string, PlaylistEntry[]>;
  const initialDisplayIds = (campaign?.display_links || []).map((link) => link.display_id);
  const initialPlaylists = initialDisplayIds.map((id) => initialTargetPlaylists[id] || legacyPlaylist);
  const initialIndividual = initialPlaylists.length > 1 && initialPlaylists.some((playlist) => JSON.stringify(playlist) !== JSON.stringify(initialPlaylists[0]));
  const presetContent = !campaign && preset?.contentId ? content.find((item) => item.id === preset.contentId) : undefined;
  const presetDisplay = !campaign && preset?.displayId ? displays.find((item) => item.id === preset.displayId) : undefined;
  const presetPlaylist: PlaylistEntry[] = presetContent ? [{ contentId: presetContent.id, durationSeconds: 10 }] : [];
  const presetDisplayIds = !campaign && preset?.displayIds?.length ? preset.displayIds.filter((id) => displays.some((display) => display.id === id)) : [];
  const presetTargetPlaylists = Object.fromEntries((preset?.targetAssignments || []).map((assignment) => [assignment.displayId, assignment.contentItems.filter((entry) => content.some((item) => item.id === entry.contentId && contentIsDisplayReady(item)))])) as Record<string, PlaylistEntry[]>;
  const presetPlaylists = presetDisplayIds.map((id) => presetTargetPlaylists[id] || []);
  const presetIndividual = presetPlaylists.length > 1 && presetPlaylists.some((playlist) => JSON.stringify(playlist) !== JSON.stringify(presetPlaylists[0]));
  const defaultDisplayIds = campaign ? initialDisplayIds : presetDisplayIds.length ? presetDisplayIds : presetDisplay ? [presetDisplay.id] : displays.length === 1 ? [displays[0].id] : [];
  const defaultPlaylist = campaign ? (initialPlaylists[0] || legacyPlaylist) : presetPlaylists[0]?.length ? presetPlaylists[0] : presetPlaylist;
  const templateEnd = !campaign && preset?.defaultDurationDays ? new Date(Date.now() + preset.defaultDurationDays * 86_400_000).toISOString() : undefined;
  const [selectedDisplays, setSelectedDisplays] = useState(() => new Set(defaultDisplayIds));
  const savedContentMode = campaign?.schedule?.portalPlaylistStrategy || preset?.playlistStrategy;
  const savedHierarchyPlaylists = campaign?.schedule?.portalHierarchyPlaylists || preset?.hierarchyPlaylists || {};
  const [contentMode, setContentMode] = useState<CampaignContentMode>(savedContentMode === "hierarchy" ? "hierarchy" : savedContentMode === "individual" || initialIndividual || presetIndividual ? "individual" : "shared");
  const [sharedPlaylist, setSharedPlaylist] = useState<PlaylistEntry[]>(defaultPlaylist);
  const [targetPlaylists, setTargetPlaylists] = useState<Record<string, PlaylistEntry[]>>(() => Object.fromEntries(defaultDisplayIds.map((id) => [id, campaign ? initialTargetPlaylists[id] || legacyPlaylist : presetTargetPlaylists[id] || presetPlaylist])));
  const [hierarchyPlaylists, setHierarchyPlaylists] = useState<Record<string, PlaylistEntry[]>>(() => Object.keys(savedHierarchyPlaylists).length ? savedHierarchyPlaylists : { all: [...defaultPlaylist] });
  const [activeHierarchyKey, setActiveHierarchyKey] = useState("all");
  const [activeTargetId, setActiveTargetId] = useState(defaultDisplayIds[0] || "");
  const [name, setName] = useState(campaign?.name || preset?.name || "");
  const [theme, setTheme] = useState(campaign?.theme || preset?.theme || "");
  const [scopeSiteId] = useState(campaign?.scope_site_id || preset?.scopeSiteId || "");
  const [scopeAreaId] = useState(campaign?.scope_area_id || preset?.scopeAreaId || "");
  const [startsAt, setStartsAt] = useState(() => localDateTime(campaign?.starts_at || new Date().toISOString()));
  const [endsAt, setEndsAt] = useState(() => localDateTime(campaign?.ends_at || templateEnd));
  const [scheduleMode, setScheduleMode] = useState<"now" | "scheduled">(() => campaign?.ends_at || templateEnd || (campaign?.starts_at && new Date(campaign.starts_at).getTime() > Date.now() + 60_000) ? "scheduled" : "now");
  const [priority, setPriority] = useState(campaign?.priority ?? preset?.priority ?? 50);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [step, setStep] = useState<number>(() => campaign ? initialStep : preset?.startStep || 1);
  const [stepCollapsed, setStepCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draftCampaignId, setDraftCampaignId] = useState(campaign?.id || "");
  const [draftNotice, setDraftNotice] = useState("");
  const [contentDialog, setContentDialog] = useState<"upload" | "ai" | null>(null);
  const [contentNotice, setContentNotice] = useState("");
  const mediaListRef = useRef<HTMLDivElement>(null);
  const isRunning = Boolean(campaign && ["active", "scheduled"].includes(campaign.status));
  const isClosed = Boolean(campaign && ["completed", "archived"].includes(campaign.status));
  const availableContent = content.filter(contentIsDisplayReady);
  const scopedAreaIds = new Set<string>();
  if (scopeAreaId) {
    scopedAreaIds.add(scopeAreaId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const area of areas) if (area.parent_id && scopedAreaIds.has(area.parent_id) && !scopedAreaIds.has(area.id)) { scopedAreaIds.add(area.id); changed = true; }
    }
  }
  const targetableDisplays = displays.filter((display) => scopeAreaId ? Boolean(display.area_id && scopedAreaIds.has(display.area_id)) : scopeSiteId ? display.site_id === scopeSiteId : true);
  const chosenDisplays = targetableDisplays.filter((display) => selectedDisplays.has(display.id));
  const selectionHierarchyTargets = buildHierarchyTargets(sites, areas, targetableDisplays);
  const hierarchyTargets = buildHierarchyTargets(sites, areas, chosenDisplays);
  const hierarchyTarget = hierarchyTargets.find((target) => target.key === activeHierarchyKey) || hierarchyTargets[0];
  const currentTargetId = selectedDisplays.has(activeTargetId) ? activeTargetId : chosenDisplays[0]?.id || "";
  function inheritedHierarchyPlaylist(display: Display): PlaylistEntry[] {
    const exact = hierarchyPlaylists[`display:${display.id}`];
    if (exact) return exact;
    const lineage = areaLineage(areas, display.area_id);
    for (const areaId of [...lineage].reverse()) {
      const areaPlaylist = hierarchyPlaylists[`area:${areaId}`];
      if (areaPlaylist) return areaPlaylist;
    }
    if (display.site_id && hierarchyPlaylists[`site:${display.site_id}`]) return hierarchyPlaylists[`site:${display.site_id}`];
    return hierarchyPlaylists.all || sharedPlaylist;
  }
  const playlistFor = (displayId: string) => {
    if (contentMode === "shared") return sharedPlaylist;
    if (contentMode === "hierarchy") {
      const display = displays.find((candidate) => candidate.id === displayId);
      return display ? inheritedHierarchyPlaylist(display) : hierarchyPlaylists.all || sharedPlaylist;
    }
    return targetPlaylists[displayId] || [];
  };
  function inheritedPlaylistForTarget(targetKey: string): PlaylistEntry[] {
    if (hierarchyPlaylists[targetKey]) return hierarchyPlaylists[targetKey];
    if (targetKey.startsWith("area:")) {
      const areaId = targetKey.slice(5);
      const area = areas.find((candidate) => candidate.id === areaId);
      const lineage = areaLineage(areas, areaId).slice(0, -1).reverse();
      for (const parentId of lineage) if (hierarchyPlaylists[`area:${parentId}`]) return hierarchyPlaylists[`area:${parentId}`];
      if (area?.site_id && hierarchyPlaylists[`site:${area.site_id}`]) return hierarchyPlaylists[`site:${area.site_id}`];
    }
    return hierarchyPlaylists.all || sharedPlaylist;
  }
  const hierarchyEditorPlaylist = inheritedPlaylistForTarget(hierarchyTarget?.key || "all");
  const currentEditorTarget = contentMode === "hierarchy" ? hierarchyTarget?.key || "all" : currentTargetId;
  const editorPlaylist = contentMode === "shared" ? sharedPlaylist : contentMode === "hierarchy" ? hierarchyEditorPlaylist : playlistFor(currentTargetId);
  const usedContentIds = [...new Set(chosenDisplays.flatMap((display) => playlistFor(display.id).map((entry) => entry.contentId)))];
  const selectedContent = usedContentIds.flatMap((id) => { const item = content.find((candidate) => candidate.id === id); return item ? [item] : []; });
  const hasUnapprovedContent = selectedContent.some((item) => !["approved", "published"].includes(item.status));
  const selectedLocationLabel = [...new Set(chosenDisplays.map((display) => [display.site?.name, display.area?.name].filter(Boolean).join(" · ") || "Ohne Standort"))].join(", ");
  const scopeLabel = scopeAreaId ? areas.find((area) => area.id === scopeAreaId)?.name : scopeSiteId ? sites.find((site) => site.id === scopeSiteId)?.name : selectedLocationLabel || "Gewählte Bildschirme";
  const automaticName = [selectedContent[0]?.title || presetContent?.title || "Anzeige", chosenDisplays[0]?.name || presetDisplay?.name || "Bildschirm", new Date(startsAt || Date.now()).toLocaleDateString("de-CH")].join(" · ");
  const effectiveName = name.trim() || automaticName;
  const quickHint = preset?.templateName
    ? defaultDisplayIds.length && usedContentIds.length
      ? `Vorlage „${preset.templateName}“ ist eingesetzt. Bildschirm und Inhalt sind übernommen – bestätigen Sie jetzt den Zeitpunkt.`
      : `Vorlage „${preset.templateName}“ ist eingesetzt. Nicht mehr verfügbare Inhalte werden ausgelassen; prüfen Sie Bildschirm und Inhalt.`
    : step === 1 && (presetContent || presetDisplay)
    ? presetDisplay
      ? `„${presetDisplay.name}“ ist bereits ausgewählt. Prüfen Sie das Ziel und gehen Sie danach weiter.`
      : `„${presetContent?.title}“ ist vorgemerkt. Wählen Sie jetzt den gewünschten Bildschirm.`
    : presetContent
      ? defaultDisplayIds.length
        ? `„${presetContent.title}“ und „${displays.find((display) => display.id === defaultDisplayIds[0])?.name || "Bildschirm"}“ sind ausgewählt.`
        : `„${presetContent.title}“ ist vorgemerkt. Wählen Sie jetzt den gewünschten Bildschirm.`
      : presetDisplay
        ? `„${presetDisplay.name}“ ist ausgewählt. Wählen Sie jetzt den Inhalt, der dort erscheinen soll.`
        : "";

  function updatePlaylist(displayId: string, updater: (playlist: PlaylistEntry[]) => PlaylistEntry[]) {
    if (contentMode === "shared") setSharedPlaylist(updater);
    else if (contentMode === "hierarchy") setHierarchyPlaylists((current) => ({ ...current, [displayId]: updater(inheritedPlaylistForTarget(displayId)) }));
    else setTargetPlaylists((current) => ({ ...current, [displayId]: updater(current[displayId] || []) }));
  }
  function toggleContent(contentId: string, displayId = currentTargetId) {
    updatePlaylist(displayId, (playlist) => playlist.some((item) => item.contentId === contentId) ? playlist.filter((item) => item.contentId !== contentId) : [...playlist, { contentId, durationSeconds: 10 }]);
  }
  function moveContent(index: number, direction: -1 | 1, displayId = currentTargetId) {
    updatePlaylist(displayId, (playlist) => { const next = [...playlist]; const target = index + direction; if (target < 0 || target >= next.length) return playlist; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }
  function setDuration(index: number, durationSeconds: number, displayId = currentTargetId) {
    updatePlaylist(displayId, (playlist) => playlist.map((entry, itemIndex) => itemIndex === index ? { ...entry, durationSeconds } : entry));
  }
  function toggleDisplay(displayId: string) {
    setSelectedDisplays((current) => {
      const next = new Set(current);
      if (next.has(displayId)) next.delete(displayId); else next.add(displayId);
      return next;
    });
    setTargetPlaylists((current) => current[displayId] ? current : { ...current, [displayId]: [...sharedPlaylist] });
    setActiveTargetId(displayId);
  }
  function setDisplayGroup(displayIds: string[], selected: boolean) {
    setSelectedDisplays((current) => { const next = new Set(current); for (const id of displayIds) selected ? next.add(id) : next.delete(id); return next; });
    setTargetPlaylists((current) => ({ ...current, ...Object.fromEntries(displayIds.filter((id) => !current[id]).map((id) => [id, [...sharedPlaylist]])) }));
    if (selected && displayIds[0]) setActiveTargetId(displayIds[0]);
  }
  function chooseContentMode(mode: CampaignContentMode) {
    if (mode === "hierarchy" && contentMode === "shared") setHierarchyPlaylists((current) => ({ ...current, all: [...sharedPlaylist] }));
    if (mode === "individual") setTargetPlaylists((current) => ({ ...current, ...Object.fromEntries(chosenDisplays.filter((display) => !current[display.id]).map((display) => [display.id, [...playlistFor(display.id)]])) }));
    if (mode === "shared" && contentMode === "hierarchy") setSharedPlaylist([...(hierarchyPlaylists.all || sharedPlaylist)]);
    setContentMode(mode);
  }
  function removeHierarchyOverride() {
    if (!hierarchyTarget || hierarchyTarget.key === "all") return;
    setHierarchyPlaylists((current) => {
      const next = { ...current };
      delete next[hierarchyTarget.key];
      return next;
    });
  }
  async function acceptCreatedContent(id?: string) {
    if (!id) throw new Error("Das neue Motiv konnte nicht übernommen werden.");
    setError("");
    const created = await onContentCreated(id);
    if (!created) throw new Error("Das neue Motiv wurde gespeichert, konnte aber noch nicht geladen werden.");
    if (!contentIsDisplayReady(created)) throw new Error(`„${created.title}“ ist noch nicht displaybereit.`);
    if (!["approved", "published"].includes(created.status)) {
      await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "update_content_status", id, status: "approved" }) });
    }
    updatePlaylist(currentEditorTarget, (playlist) => playlist.some((entry) => entry.contentId === id) ? playlist : [...playlist, { contentId: id, durationSeconds: 10 }]);
    setContentNotice(`„${created.title}“ wurde erstellt, freigegeben und ausgewählt.`);
    setContentDialog(null);
  }
  const activeHierarchyKeys = new Set(hierarchyTargets.map((target) => target.key));
  const effectiveHierarchyPlaylists = Object.fromEntries(Object.entries(hierarchyPlaylists).filter(([key]) => activeHierarchyKeys.has(key)));
  const campaignData = { name: effectiveName, theme: theme || null, priority, scopeSiteId: scopeSiteId || null, scopeAreaId: scopeAreaId || null, startsAt: scheduleMode === "now" ? campaign?.starts_at || new Date().toISOString() : startsAt ? new Date(startsAt).toISOString() : null, endsAt: scheduleMode === "scheduled" && endsAt ? new Date(endsAt).toISOString() : null, playlistStrategy: contentMode, hierarchyPlaylists: contentMode === "hierarchy" ? effectiveHierarchyPlaylists : {} };

  async function ensureCampaignDraft() {
    if (draftCampaignId) return draftCampaignId;
    const created = await api<{ record: Campaign }>("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "create_campaign", ...campaignData }) });
    setDraftCampaignId(created.record.id);
    setDraftNotice("Ihre Auswahl wird automatisch als Entwurf gespeichert.");
    await onDraftCreated();
    return created.record.id;
  }

  async function persistDraftConfiguration(includeContent: boolean, nextStep: 2 | 3 | 4) {
    const campaignId = await ensureCampaignDraft();
    const targetAssignments = chosenDisplays.map((display) => ({ displayId: display.id, contentItems: includeContent ? playlistFor(display.id) : [] }));
    const draftCampaignData = includeContent ? campaignData : { ...campaignData, playlistStrategy: "shared", hierarchyPlaylists: {} };
    await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "configure_campaign", id: campaignId, ...draftCampaignData, targetAssignments, setupStep: nextStep }) });
    setDraftNotice(nextStep === 4
      ? "Bildschirme und Inhalte sind gespeichert. Prüfen Sie jetzt alles vor dem Start."
      : nextStep === 3
        ? "Die Inhalte sind gespeichert. Legen Sie jetzt fest, wann sie angezeigt werden."
        : `${chosenDisplays.length} ${chosenDisplays.length === 1 ? "Bildschirm ist" : "Bildschirme sind"} ausgewählt. Wählen Sie jetzt den Inhalt.`);
    await onDraftCreated();
  }

  async function nextStep() {
    if (busy) return;
    setError("");
    if (step === 1 && !chosenDisplays.length) { setError("Wählen Sie mindestens einen Bildschirm aus."); return; }
    if (step === 2) {
      const emptyTarget = chosenDisplays.find((display) => !playlistFor(display.id).length);
      if (emptyTarget) { setError(`Wählen Sie mindestens einen Inhalt für „${emptyTarget.name}“ aus.`); return; }
    }
    if (step === 3 && scheduleMode === "scheduled" && !startsAt) { setError("Wählen Sie den gewünschten Startzeitpunkt."); return; }
    if (step === 3 && scheduleMode === "scheduled" && startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) { setError("Das Ende muss nach dem Start liegen."); return; }
    setBusy(true);
    try {
      if (step === 1) await persistDraftConfiguration(false, 2);
      if (step === 2) await persistDraftConfiguration(true, 3);
      if (step === 3) await persistDraftConfiguration(true, 4);
      setStepCollapsed(false);
      setStep((current) => Math.min(4, current + 1));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Kampagne konnte nicht als Entwurf gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }
  async function save(activate = false) {
    setBusy(true); setError("");
    try {
      if ((activate || isRunning) && hasUnapprovedContent) {
        await Promise.all(selectedContent.filter((item) => !["approved", "published"].includes(item.status)).map((item) => api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "update_content_status", id: item.id, status: "approved" }) })));
      }
      let campaignId = draftCampaignId || campaign?.id;
      if (!campaignId) {
        campaignId = await ensureCampaignDraft();
      }
      const targetAssignments = chosenDisplays.map((display) => ({ displayId: display.id, contentItems: playlistFor(display.id) }));
      await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "configure_campaign", id: campaignId, ...campaignData, targetAssignments, setupStep: 4 }) });
      if (activate) await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "activate_campaign", id: campaignId }) });
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Kampagne konnte nicht gespeichert werden"); }
    finally { setBusy(false); }
  }
  async function pause() {
    setBusy(true); setError("");
    try { if (campaign) await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "pause_campaign", id: campaign.id }) }); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Kampagne konnte nicht pausiert werden"); } finally { setBusy(false); }
  }
  function contentSelection(playlist: PlaylistEntry[], displayId: string) {
    return <div className="selection-list media-selection" ref={mediaListRef}>{availableContent.map((item) => { const index = playlist.findIndex((entry) => entry.contentId === item.id); const selected = index >= 0; return <div className={`selection-row ${selected ? "selected" : ""}`} key={item.id}><label><input type="checkbox" checked={selected} onChange={() => toggleContent(item.id, displayId)} disabled={!canEdit}/><span><strong>{item.title}</strong><small>{item.content_type.toUpperCase()} · {labels[item.status] || item.status}</small></span></label>{selected && <div className="playlist-controls"><button type="button" aria-label="Nach oben" onClick={() => moveContent(index,-1,displayId)} disabled={index === 0 || !canEdit}>↑</button><button type="button" aria-label="Nach unten" onClick={() => moveContent(index,1,displayId)} disabled={index === playlist.length-1 || !canEdit}>↓</button>{item.content_type === "video" ? <span className="playlist-auto-duration">Spielt vollständig</span> : <label><span>Anzeigedauer</span><input type="number" min="5" max="3600" value={playlist[index].durationSeconds} onChange={(event) => setDuration(index, Number(event.target.value), displayId)} disabled={!canEdit}/><span>Sek.</span></label>}</div>}</div>})}{!availableContent.length && <div className="wizard-empty"><strong>Noch kein Inhalt vorhanden</strong><p>Laden Sie oben ein Bild oder Video hoch oder erstellen Sie ein KI-Bild.</p></div>}</div>;
  }
  const stepLabels = ["Wo?", "Was?", "Wann?", "Prüfen & Start"];
  const nextStepLabels = ["Weiter zu Inhalten", "Weiter zum Zeitpunkt", "Weiter zur Prüfung"];
  const previousStepLabels = ["", "Zurück zu Bildschirmen", "Zurück zu Inhalten", "Zurück zum Zeitpunkt"];
  const stepGuidance = [
    "Wählen Sie, auf welchen Bildschirmen etwas erscheinen soll.",
    "Wählen Sie Bilder oder Videos – oder laden Sie neue hoch.",
    "Sofort anzeigen oder einen gewünschten Zeitraum festlegen.",
    "Vorschau und Auswahl kontrollieren, dann veröffentlichen.",
  ];
  const stepSummaries = [
    chosenDisplays.length ? `${chosenDisplays.length} ${chosenDisplays.length === 1 ? "Bildschirm" : "Bildschirme"} ausgewählt` : "Noch kein Bildschirm ausgewählt",
    usedContentIds.length ? `${usedContentIds.length} ${usedContentIds.length === 1 ? "Inhalt" : "Inhalte"} ausgewählt` : "Noch kein Inhalt ausgewählt",
    scheduleMode === "now" ? "Startet sofort" : startsAt ? `Start ${new Date(startsAt).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" })}` : "Zeitpunkt noch offen",
    chosenDisplays.length && usedContentIds.length ? `${chosenDisplays.length} ${chosenDisplays.length === 1 ? "Bildschirm" : "Bildschirme"} · ${usedContentIds.length} ${usedContentIds.length === 1 ? "Inhalt" : "Inhalte"}` : "Noch nicht vollständig",
  ];
  const previewEntry = chosenDisplays[0] ? playlistFor(chosenDisplays[0].id)[0] : undefined;
  const previewContent = content.find((item) => item.id === previewEntry?.contentId);
  const siteGroups = [...sites.map((site) => ({ id: site.id, name: site.name, displays: targetableDisplays.filter((display) => display.site_id === site.id) })), { id: "unassigned", name: "Ohne Standort", displays: targetableDisplays.filter((display) => !display.site_id) }].filter((group) => group.displays.length);

  return <><div className="dialog-backdrop campaign-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !contentDialog && onClose()}><section className="dialog campaign-editor" role="dialog" aria-modal="true"><button className="dialog-close" onClick={onClose} aria-label="Schließen">×</button><div className="campaign-editor-head"><div><div className="eyebrow">Geführte Ausspielung</div><h2>{campaign ? effectiveName : "Auf Bildschirm anzeigen"}</h2></div>{campaign && <Status value={campaign.status}/>}</div>
    <div className="funnel-progress" aria-hidden="true">{stepLabels.map((label, index) => <i className={`${step === index + 1 ? "active" : ""} ${step > index + 1 ? "complete" : ""}`} key={label}/>)}</div>
    <button type="button" className={`funnel-current-step ${stepCollapsed ? "collapsed" : "expanded"}`} aria-expanded={!stepCollapsed} onClick={() => setStepCollapsed((current) => !current)}><span>{step}</span><span className="funnel-current-copy"><small>Schritt {step} von 4</small><strong>{stepLabels[step - 1]}</strong><em>{stepCollapsed ? stepSummaries[step - 1] : stepGuidance[step - 1]}</em></span><b>{stepCollapsed ? "Öffnen ↓" : "Zuklappen ↑"}</b></button>
    {quickHint && <div className="wizard-success quick-assignment-hint" role="status">✓ {quickHint}</div>}
    {draftNotice && <div className="wizard-success" role="status">✓ {draftNotice}</div>}
    {isRunning && <div className="wizard-success" role="status">Änderungen an dieser laufenden Ausspielung werden beim Speichern direkt auf die betroffenen Bildschirme übertragen.</div>}
    <div className={`wizard-stage ${stepCollapsed ? "is-collapsed" : ""}`}>
      {step === 1 && displays.length > 0 && canManageDevices && <div className="wizard-inline-action"><span>Der gewünschte Bildschirm fehlt?</span><button type="button" className="secondary compact" onClick={onCreateDisplay}>+ Neuen Bildschirm vorbereiten</button></div>}
      {step === 1 && <section>
        <div className="wizard-stage-head"><div><span>Schritt 1 · Wo?</span><h3>Wo soll etwas erscheinen?</h3><p>Wählen Sie ganze Standorte, Gebäude oder Bereiche – oder einzelne Bildschirme.</p></div><b>{chosenDisplays.length} gewählt</b></div>
        <HierarchySelectionShortcuts targets={selectionHierarchyTargets} selectedIds={selectedDisplays} disabled={!canEdit} onChange={setDisplayGroup}/>
        {displayGroups.items.length > 0 && <div className="campaign-display-group-picks"><span>Schnellauswahl nach Gruppe</span>{displayGroups.items.map((group) => { const groupIds = group.displayIds.filter((id) => targetableDisplays.some((display) => display.id === id)); const selected = groupIds.length > 0 && groupIds.every((id) => selectedDisplays.has(id)); return <button type="button" className={selected ? "selected" : ""} disabled={!canEdit || !groupIds.length} onClick={() => setDisplayGroup(groupIds, !selected)} key={group.id}>{selected ? "✓ " : ""}{group.name} · {groupIds.length}</button>; })}</div>}
        <div className="target-tree">{siteGroups.map((site) => { const siteIds = site.displays.map((display) => display.id); const allSiteSelected = siteIds.every((id) => selectedDisplays.has(id)); const areaGroups = [...areas.filter((area) => area.site_id === site.id).map((area) => ({ id: area.id, name: area.name, displays: site.displays.filter((display) => display.area_id === area.id) })), { id: `${site.id}-other`, name: "Ohne Bereich", displays: site.displays.filter((display) => !display.area_id) }].filter((group) => group.displays.length); return <article className="target-site" key={site.id}><header><div><strong>{site.name}</strong><small>{site.displays.length} {site.displays.length === 1 ? "Bildschirm" : "Bildschirme"}</small></div><button type="button" onClick={() => setDisplayGroup(siteIds, !allSiteSelected)} disabled={!canEdit}>{allSiteSelected ? "Alle entfernen" : "Alle wählen"}</button></header>{areaGroups.map((area) => <div className="target-area" key={area.id}><div className="target-area-name"><strong>{area.name}</strong><button type="button" onClick={() => setDisplayGroup(area.displays.map((display) => display.id), !area.displays.every((display) => selectedDisplays.has(display.id)))} disabled={!canEdit}>Bereich wählen</button></div><div className="display-selection">{area.displays.map((display) => <label className={selectedDisplays.has(display.id) ? "selected" : ""} key={display.id}><input type="checkbox" checked={selectedDisplays.has(display.id)} onChange={() => toggleDisplay(display.id)} disabled={!canEdit}/><span><strong>{display.name}</strong><small>{labels[display.status] || display.status}</small></span></label>)}</div></div>)}</article>})}{!targetableDisplays.length && <div className="wizard-empty"><strong>Noch kein Bildschirm vorhanden</strong><p>Bereiten Sie zuerst den Bildschirm mit Name und Standort vor. Verbunden wird das Gerät erst ganz am Schluss.</p>{canManageDevices && <button type="button" className="secondary" onClick={onCreateDisplay}>Ersten Bildschirm vorbereiten</button>}</div>}</div>
      </section>}
      {step === 2 && <section>
        <div className="wizard-stage-head"><div><span>Schritt 2 · Was?</span><h3>Was soll dort laufen?</h3><p>Beginnen Sie mit einem Standard und passen Sie nur die Orte an, die etwas anderes zeigen sollen.</p></div></div>
        {chosenDisplays.length > 1 && <div className="content-mode">
          <button type="button" className={contentMode === "shared" ? "selected" : ""} onClick={() => chooseContentMode("shared")} disabled={!canEdit}><strong>Überall gleich</strong><small>Eine Playlist für alle gewählten Bildschirme</small></button>
          <button type="button" className={contentMode === "hierarchy" ? "selected" : ""} onClick={() => chooseContentMode("hierarchy")} disabled={!canEdit}><strong>Nach Ort anpassen</strong><small>Standard → Standort → Gebäude oder Bereich</small></button>
          <button type="button" className={contentMode === "individual" ? "selected" : ""} onClick={() => chooseContentMode("individual")} disabled={!canEdit}><strong>Je Bildschirm anders</strong><small>Volle Kontrolle für jeden Bildschirm</small></button>
        </div>}
        {contentMode === "hierarchy" && <HierarchyPlaylistTabs targets={hierarchyTargets} activeKey={hierarchyTarget?.key || "all"} overriddenKeys={new Set(Object.keys(hierarchyPlaylists))} onChange={setActiveHierarchyKey}/>}
        {contentMode === "hierarchy" && hierarchyTarget?.key !== "all" && <div className="hierarchy-inheritance-note"><span><strong>{hierarchyTarget?.label}</strong><small>{hierarchyPlaylists[hierarchyTarget.key] ? "Verwendet eine eigene Playlist." : "Übernimmt momentan automatisch die nächsthöhere Playlist."}</small></span>{hierarchyPlaylists[hierarchyTarget.key] && <button type="button" className="secondary compact" onClick={removeHierarchyOverride} disabled={!canEdit}>Eigene Playlist entfernen</button>}</div>}
        {canEdit && <div className="motif-source-actions" aria-label="Inhalt auswählen oder erstellen"><button type="button" onClick={() => mediaListRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })}><span>✓</span><strong>Vorhandenen Inhalt wählen</strong><small>Aus Ihrer Mediathek</small></button><button type="button" onClick={() => { setContentNotice(""); setContentDialog("upload"); }}><span>↑</span><strong>Bild oder Video hochladen</strong><small>Neue Datei verwenden</small></button><button type="button" onClick={() => { setContentNotice(""); setContentDialog("ai"); }}><span>✦</span><strong>KI-Bild erstellen</strong><small>{aiCredits.balance?.available ?? "–"} Credits verfügbar</small></button></div>}
        {contentNotice && <div className="wizard-success" role="status">✓ {contentNotice}</div>}
        {contentMode === "individual" && <div className="target-tabs">{chosenDisplays.map((display) => <button type="button" className={currentTargetId === display.id ? "active" : ""} onClick={() => setActiveTargetId(display.id)} key={display.id}><strong>{display.name}</strong><small>{playlistFor(display.id).length} Inhalte</small></button>)}</div>}
        <div className="content-target-heading"><span>{contentMode === "shared" ? "Diese Playlist läuft auf allen gewählten Bildschirmen" : contentMode === "hierarchy" ? `Playlist für ${hierarchyTarget?.label || "alle"}` : `Inhalte für ${displays.find((display) => display.id === currentTargetId)?.name || "Bildschirm"}`}</span><b>{editorPlaylist.length} gewählt</b></div>
        {contentSelection(editorPlaylist, currentEditorTarget)}
      </section>}
      {step === 3 && <section><div className="wizard-stage-head"><div><span>Schritt 3 · Wann?</span><h3>Wann soll die Anzeige laufen?</h3><p>Für den einfachen Start genügt eine Auswahl. Weitere Angaben sind freiwillig.</p></div></div><div className="simple-schedule"><button type="button" className={scheduleMode === "now" ? "selected" : ""} onClick={() => setScheduleMode("now")} disabled={!canEdit}><strong>Jetzt starten</strong><small>Läuft nach der Veröffentlichung, bis Sie sie stoppen.</small></button><button type="button" className={scheduleMode === "scheduled" ? "selected" : ""} onClick={() => setScheduleMode("scheduled")} disabled={!canEdit}><strong>Für später planen</strong><small>Start und auf Wunsch ein Ende festlegen.</small></button></div>{scheduleMode === "scheduled" && <div className="wizard-date-pair"><label>Start<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} disabled={!canEdit}/><small>Ab diesem Zeitpunkt wird der Inhalt angezeigt.</small></label><label>Ende <small>Optional</small><input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} disabled={!canEdit}/><small>Ohne Ende läuft die Anzeige, bis Sie sie stoppen.</small></label></div>}<button type="button" className="advanced-toggle" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((current) => !current)}>{advancedOpen ? "Erweiterte Einstellungen ausblenden ↑" : "Erweiterte Einstellungen anzeigen ↓"}</button>{advancedOpen && <div className="advanced-campaign-settings"><div className="campaign-basics"><label>Interner Name <small>Optional</small><input value={name} onChange={(event) => setName(event.target.value)} disabled={!canEdit} placeholder={automaticName}/><small>Ohne Eingabe wird der Name automatisch erstellt.</small></label><label>Notiz oder Thema <small>Optional</small><input value={theme} onChange={(event) => setTheme(event.target.value)} disabled={!canEdit} placeholder="z. B. Herbstaktion"/></label></div><label className="campaign-priority">Priorität bei mehreren gleichzeitigen Anzeigen<select value={priority} onChange={(event) => setPriority(Number(event.target.value))} disabled={!canEdit}><option value={25}>Hintergrund</option><option value={50}>Normal</option><option value={75}>Wichtig</option><option value={100}>Dringend</option></select><small>Normal ist für die meisten Anzeigen richtig.</small></label><div className="priority-explanation"><strong>Was passiert bei Überschneidungen?</strong><span>Die Anzeige mit der höheren Priorität gewinnt. Zwei Anzeigen mit derselben Priorität dürfen auf demselben Bildschirm zeitlich nicht kollidieren – das Portal warnt vor dem Start.</span></div></div>}</section>}
      {step === 4 && <section><div className="wizard-stage-head"><div><span>Schritt 4 · Prüfen</span><h3>Alles richtig?</h3><p>Kontrollieren Sie Bildschirm, Inhalt und Zeitpunkt. Danach ist die Anzeige bereit.</p></div></div><div className="wizard-review"><div className="wizard-preview">{previewContent?.preview_url && previewContent.content_type === "image" ? <img src={previewContent.preview_url} alt="Vorschau des gewählten Inhalts"/> : previewContent?.preview_url && previewContent.content_type === "video" ? <video src={previewContent.preview_url} poster={previewContent.poster_url || undefined} autoPlay muted loop playsInline preload="metadata" aria-label={`Videovorschau ${previewContent.title}`}/> : <div><span>Vorschau</span><strong>{previewContent?.title || "Kein Inhalt"}</strong></div>}</div><div className="wizard-summary"><div><span>Ausspielung</span><strong>{effectiveName}{theme ? ` · ${theme}` : ""}</strong></div><div><span>Standort</span><strong>{scopeLabel || "Gewählte Bildschirme"}</strong></div><div><span>Zeitpunkt</span><strong>{scheduleMode === "now" ? "Sofort · bis Sie die Anzeige stoppen" : `${startsAt ? new Date(startsAt).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" }) : "Start offen"}${endsAt ? ` – ${new Date(endsAt).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" })}` : " · ohne Enddatum"}`}</strong></div></div></div><div className="target-review-list">{chosenDisplays.map((display) => <div key={display.id}><span><strong>{display.name}</strong><small>{display.site?.name || "Ohne Standort"}{display.area?.name ? ` · ${display.area.name}` : ""}</small></span><b>{playlistFor(display.id).map((entry) => content.find((item) => item.id === entry.contentId)?.title).filter(Boolean).join(", ") || "Kein Inhalt"}</b></div>)}</div>{hasUnapprovedContent && <div className="editor-notice">{isRunning ? "Beim Speichern werden neue Inhalte automatisch freigegeben und live übernommen." : "Beim Veröffentlichen werden die ausgewählten Inhalte automatisch für die Bildschirme freigegeben."}</div>}</section>}
    </div>
    {step === 4 && campaign && chosenDisplays.length > 0 && <div className="campaign-safe-preview"><span><strong>Auf dem Bildschirm prüfen</strong><small>Öffnet dieselbe Anzeige wie auf dem ersten gewählten Bildschirm – noch ohne Veröffentlichung.</small></span><a href={`/player?preview=${encodeURIComponent(chosenDisplays[0].id)}&campaign=${encodeURIComponent(campaign.id)}`} target="_blank" rel="noreferrer">Vorschau öffnen</a></div>}
    {error && <div className="form-error">{error}</div>}<footer className="editor-actions"><button className="secondary" onClick={onClose}>Schließen</button>{stepCollapsed ? <button className="primary" onClick={() => setStepCollapsed(false)}>Schritt öffnen</button> : <>{canEdit && isRunning && <button className="secondary danger" onClick={() => void pause()} disabled={busy}>Anzeige pausieren</button>}{step > 1 && <button className="secondary" onClick={() => { setError(""); setStepCollapsed(false); setStep((current) => current - 1); }} disabled={busy}>{previousStepLabels[step - 1]}</button>}{step < 4 && <button className="primary" onClick={nextStep}>{nextStepLabels[step - 1]}</button>}{canEdit && step === 4 && <><button className={isRunning || isClosed ? "primary" : "secondary"} onClick={() => void save(false)} disabled={busy}>{busy ? "Wird gespeichert …" : isRunning ? "Änderungen live übernehmen" : campaign ? "Änderungen speichern" : "Später fertigstellen"}</button>{!isRunning && !isClosed && <button className="primary" onClick={() => void save(true)} disabled={busy}>{busy ? "Wird gespeichert …" : scheduleMode === "scheduled" && startsAt && new Date(startsAt) > new Date() ? "Anzeige planen" : "Jetzt veröffentlichen"}</button>}</>}</>}</footer>
  </section></div>{contentDialog === "upload" && <CreateDialog type="content" initialContentType="image" nested waitUntilReady={onWaitForContentReady} onClose={() => setContentDialog(null)} onCreated={acceptCreatedContent}/>} {contentDialog === "ai" && <AiImageDialog credits={aiCredits} canBuy={canManageDevices} checkoutNotice={null} onDismissCheckoutNotice={() => undefined} nested onClose={() => setContentDialog(null)} onCreated={acceptCreatedContent}/>}</>;
}

function AiImageDialog({ credits, canBuy, checkoutNotice, onDismissCheckoutNotice, nested = false, onClose, onCreated }: { credits: AiCredits; canBuy: boolean; checkoutNotice: CreditPurchaseNotice | null; onDismissCheckoutNotice: () => void; nested?: boolean; onClose: () => void; onCreated: (id?: string) => void | Promise<void> }) {
  const [quality, setQuality] = useState("medium");
  const [format, setFormat] = useState("landscape");
  const [headlineEnabled, setHeadlineEnabled] = useState(false);
  const [headline, setHeadline] = useState("");
  const [headlinePosition, setHeadlinePosition] = useState("bottom");
  const [headlineAlign, setHeadlineAlign] = useState("center");
  const [headlineColor, setHeadlineColor] = useState("#ffffff");
  const [headlineBackdrop, setHeadlineBackdrop] = useState(true);
  const [busy, setBusy] = useState(false);
  const [buying, setBuying] = useState("");
  const [error, setError] = useState("");
  const [generationKey, setGenerationKey] = useState(() => crypto.randomUUID());
  const selectedQuality = credits.qualities.find((entry) => entry.id === quality) || credits.qualities[0];
  const available = Number(credits.balance?.available || 0);
  const canGenerate = credits.enabled && credits.balance && selectedQuality && available >= selectedQuality.credits;

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/dashboard/records?portalAi=image", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: generationKey,
          title: form.get("title"),
          prompt: form.get("prompt"),
          quality,
          format,
          headline: { enabled: headlineEnabled, text: headline, position: headlinePosition, align: headlineAlign, color: headlineColor, backdrop: headlineBackdrop },
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; record?: { id?: string } };
      if (!response.ok) {
        if (response.status !== 409) setGenerationKey(crypto.randomUUID());
        throw new Error(result.error || "Das Bild konnte nicht erstellt werden");
      }
      await onCreated(result.record?.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Das Bild konnte nicht erstellt werden");
    } finally { setBusy(false); }
  }

  async function buy(packageCode: string) {
    if (buying) return;
    setBuying(packageCode); setError("");
    try {
      const result = await api<{ checkoutUrl: string }>("/api/dashboard/records?portalAi=credits", { method: "POST", body: JSON.stringify({ packageCode }) });
      location.assign(result.checkoutUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Stripe Checkout konnte nicht geöffnet werden");
      setBuying("");
    }
  }

  return <div className={`dialog-backdrop ai-backdrop ${nested ? "campaign-child-backdrop" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && !busy && !buying && onClose()}><section className={`dialog ai-dialog ${checkoutNotice ? "has-credit-notice" : ""}`} role="dialog" aria-modal="true"><button className="dialog-close" onClick={onClose} disabled={busy || Boolean(buying)} aria-label="Schließen">×</button>
    <header className="ai-dialog-head"><div><div className="eyebrow">SwissCompact Bildstudio</div><h2>KI-Bild erstellen</h2><p>Ein displayfertiges Motiv – wahlweise mit präziser Überschrift.</p></div><div className="credit-balance"><span>Guthaben</span><strong>{credits.balance?.available ?? "–"}</strong><small>KI-Credits</small></div></header>
    {checkoutNotice && <div className={`credit-return-notice ${checkoutNotice.tone}`} role="status"><span aria-hidden="true">{checkoutNotice.tone === "success" ? "✓" : "i"}</span><div><strong>{checkoutNotice.title}</strong><small>{checkoutNotice.detail}</small></div><button type="button" onClick={onDismissCheckoutNotice} aria-label="Kaufhinweis schließen">×</button></div>}
    <div className="ai-dialog-grid"><form onSubmit={generate}><label className="ai-title-field">Inhaltstitel<input name="title" required autoFocus maxLength={180} placeholder="z. B. Herbstaktion"/></label><label className="ai-prompt-field">Bildbeschreibung<textarea name="prompt" required rows={5} maxLength={1200} placeholder="Beschreiben Sie Motiv, Stimmung, Farben und gewünschte Bildwirkung …"/></label>
      <fieldset className="ai-format-field"><legend>Displayformat</legend><div className="ai-options formats">{credits.formats.map((entry) => <label className={format === entry.id ? "selected" : ""} key={entry.id}><input type="radio" name="format" value={entry.id} checked={format === entry.id} onChange={() => setFormat(entry.id)}/><strong>{entry.label}</strong><small>{entry.size}</small></label>)}</div></fieldset>
      <fieldset className="ai-quality-field"><legend>Qualität</legend><div className="ai-options qualities">{credits.qualities.map((entry) => <label className={quality === entry.id ? "selected" : ""} key={entry.id}><input type="radio" name="quality" value={entry.id} checked={quality === entry.id} onChange={() => setQuality(entry.id)}/><strong>{entry.label}</strong><small>{entry.description}</small><b>{entry.credits} {entry.credits === 1 ? "Credit" : "Credits"}</b></label>)}</div></fieldset>
      <section className="headline-config"><label className="toggle-line"><span><strong>Überschrift einblenden</strong><small>Wird nach der KI-Erzeugung fehlerfrei gesetzt.</small></span><input type="checkbox" checked={headlineEnabled} onChange={(event) => setHeadlineEnabled(event.target.checked)}/></label>{headlineEnabled && <div className="headline-fields"><label>Überschrift<input value={headline} required maxLength={120} onChange={(event) => setHeadline(event.target.value)} placeholder="Ihre Botschaft"/></label><div className="headline-row"><label>Position<select value={headlinePosition} onChange={(event) => setHeadlinePosition(event.target.value)}><option value="top">Oben</option><option value="center">Mitte</option><option value="bottom">Unten</option></select></label><label>Ausrichtung<select value={headlineAlign} onChange={(event) => setHeadlineAlign(event.target.value)}><option value="left">Links</option><option value="center">Zentriert</option><option value="right">Rechts</option></select></label><label className="color-field">Farbe<input type="color" value={headlineColor} onChange={(event) => setHeadlineColor(event.target.value)}/></label></div><label className="check-line"><input type="checkbox" checked={headlineBackdrop} onChange={(event) => setHeadlineBackdrop(event.target.checked)}/>Dunkle Hintergrundfläche für bessere Lesbarkeit</label></div>}</section>
      {!credits.enabled && <div className="form-error">Die OpenAI-Verbindung ist noch nicht konfiguriert.</div>}{credits.enabled && !credits.balance && <div className="form-error">Das Credit-System muss noch in Supabase eingerichtet werden.</div>}{selectedQuality && credits.balance && available < selectedQuality.credits && <div className="form-error">Für diese Qualität fehlen {selectedQuality.credits - available} KI-Credits.</div>}{error && <div className="form-error">{error}</div>}<button className="primary ai-generate" disabled={busy || !canGenerate}>{busy ? "Motiv wird erstellt …" : `Für ${selectedQuality?.credits || 0} Credits erstellen`}</button><small className="generation-note">Die Erstellung kann bis zu zwei Minuten dauern. Bei einem technischen Fehler werden die Credits automatisch zurückerstattet.</small></form>
      <div className="ai-preview-column"><div className={`ai-preview ${format}`}><div className="ai-preview-art"><span>✦</span></div>{headlineEnabled && headline && <div className={`ai-preview-headline pos-${headlinePosition} align-${headlineAlign} ${headlineBackdrop ? "backdrop" : ""}`} style={{ color: headlineColor }}>{headline}</div>}</div><div className="ai-safety"><strong>Bildschirmfertig gespeichert</strong><p>Das Ergebnis erscheint als Entwurf direkt unter „Medien & Vorlagen“.</p></div>{canBuy && <section className={`credit-shop ${buying ? "is-buying" : ""}`}><div><span>Zusätzliche Credits</span><h3>Guthaben aufladen</h3></div>{credits.packages.map((entry) => { const isBuying = buying === entry.id; return <button type="button" className={isBuying ? "is-loading" : ""} aria-busy={isBuying} disabled={!credits.stripeEnabled || Boolean(buying)} onClick={() => void buy(entry.id)} key={entry.id}>{isBuying ? <span className="credit-checkout-loading" role="status"><i aria-hidden="true"/><strong>Checkout wird geöffnet …</strong></span> : <><span><strong>{entry.credits} Credits</strong><small>{entry.label}</small></span><b>{new Intl.NumberFormat("de-CH", { style: "currency", currency: entry.currency.toUpperCase() }).format(entry.amountMinor / 100)}</b></>}</button>; })}{!credits.stripeEnabled && <small>Stripe Checkout ist noch nicht konfiguriert.</small>}</section>}</div></div>
  </section></div>;
}

function CreateDialog({ type, initialContentType = "image", nested = false, waitUntilReady, onClose, onCreated }: { type: "content" | "campaign"; initialContentType?: string; nested?: boolean; waitUntilReady?: (id: string) => Promise<Content>; onClose: () => void; onCreated: (id?: string) => void | Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<"idle" | "preparing" | "uploading" | "processing" | "ready">("idle");
  const [createdMediaId, setCreatedMediaId] = useState("");
  const [contentType, setContentType] = useState(initialContentType);
  const [inspectionBusy, setInspectionBusy] = useState(false);
  const [inspection, setInspection] = useState<InspectedMedia | null>(null);

  async function inspectSelection(file?: File) {
    setInspection(null);
    setError("");
    if (!file?.size) return;
    setInspectionBusy(true);
    try {
      setInspection(await inspectMediaFile(file, contentType));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Datei konnte nicht geprüft werden.");
    } finally {
      setInspectionBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    if (createdMediaId && waitUntilReady) {
      try {
        setUploadStage("processing");
        await waitUntilReady(createdMediaId);
        setUploadStage("ready");
        await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
        await onCreated(createdMediaId);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Die Verfügbarkeit konnte nicht geprüft werden.");
      } finally {
        setBusy(false);
      }
      return;
    }
    setUploadProgress(0); setUploadStage("preparing"); const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "");
    const body = type === "content" ? { action: "create_content", title, contentType: form.get("contentType"), text: form.get("text") } : { action: "create_campaign", name: title, startsAt: form.get("startsAt") || null, endsAt: form.get("endsAt") || null };
    let preparedId = "";
    let createdId = "";
    try {
      const file = form.get("file");
      if (type === "content" && (contentType === "image" || contentType === "video")) {
        if (!(file instanceof File) || !file.size) throw new Error("Bitte wählen Sie eine Datei aus.");
        const inspected = inspection?.file === file ? inspection : await inspectMediaFile(file, contentType);
        const mimeType = mediaMimeType(file);
        const prepared = await api<PreparedMediaUpload>("/api/dashboard/records?audience=portal", {
          method: "POST",
          body: JSON.stringify({ action: "prepare_media_upload", title, mimeType, sizeBytes: file.size, mediaMetadata: inspected.metadata, createPoster: Boolean(inspected.poster) }),
        });
        preparedId = prepared.record.id;
        createdId = prepared.record.id;
        setUploadStage("uploading");
        if (contentType === "video" && prepared.upload.provider === "mux") {
          await uploadMuxVideo(file, prepared.upload.url, mimeType, setUploadProgress);
        } else if (contentType === "video") {
          await uploadVideo(file, prepared, mimeType, setUploadProgress);
        } else {
          if (prepared.upload.provider !== "supabase") throw new Error("Das Bild hat ein ungültiges Upload-Ziel.");
          await uploadSignedBlob(file, prepared.upload.signedUrl);
          setUploadProgress(100);
        }
        if (inspected.poster && prepared.posterUpload?.signedUrl) await uploadSignedBlob(inspected.poster, prepared.posterUpload.signedUrl);
        await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "finalize_media_upload", id: prepared.record.id }) });
        preparedId = "";
        setCreatedMediaId(createdId);
        if (waitUntilReady) {
          setUploadStage("processing");
          await waitUntilReady(createdId);
        }
        setUploadStage("ready");
        if (contentType === "video") await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
      } else {
        const created = await api<{ record?: { id?: string } }>("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify(body) });
        createdId = created.record?.id || "";
      }
      await onCreated(createdId || undefined);
    }
    catch (reason) {
      if (preparedId) await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "cancel_media_upload", id: preparedId }) }).catch(() => undefined);
      setError(preparedId ? storageUploadMessage(reason) : reason instanceof Error ? reason.message : "Speichern fehlgeschlagen");
    } finally { setBusy(false); }
  }
  const isMedia = contentType === "image" || contentType === "video";
  const isProcessing = uploadStage === "processing";
  const progressTitle = uploadStage === "ready" ? "Video ist displaybereit" : isProcessing ? "Video wird für Bildschirme aufbereitet …" : uploadProgress >= 100 ? "Datei vollständig übertragen" : uploadProgress > 0 ? `${uploadProgress} % der Datei übertragen` : "Geprüfter Upload wird vorbereitet …";
  const progressDetail = isProcessing ? "Upload abgeschlossen · Qualität und Wiedergabe werden geprüft" : uploadStage === "ready" ? "Verarbeitung abgeschlossen" : uploadProgress >= 100 ? "Die Videoaufbereitung startet jetzt" : "Bitte lassen Sie dieses Fenster geöffnet";
  return <div className={`dialog-backdrop ${nested ? "campaign-child-backdrop" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}><section className="dialog" role="dialog" aria-modal="true"><button className="dialog-close" onClick={onClose} disabled={busy} aria-label="Schließen">×</button><div className="eyebrow">{type === "content" ? "Medien & Vorlagen" : "Anzeigen"}</div><h2>{type === "content" ? "Bild oder Video hochladen" : "Neue Anzeige erstellen"}</h2><form onSubmit={submit}><label>{type === "content" ? "Titel" : "Name der Anzeige"}<input name="title" required autoFocus disabled={Boolean(createdMediaId)} /></label>{type === "content" ? <><label>Was möchten Sie hinzufügen?<select name="contentType" value={contentType} disabled={Boolean(createdMediaId)} onChange={(event) => { setContentType(event.target.value); setInspection(null); setError(""); }}><option value="image">Bild hochladen</option><option value="video">Video hochladen</option><option value="text">Textanzeige</option><option value="web">Web-Inhalt</option><option value="composition">Leerer Entwurf (erweitert)</option></select></label>{isMedia ? <><label className="file-field"><span>{contentType === "image" ? "Bilddatei" : "Videodatei"}</span><input name="file" type="file" required disabled={Boolean(createdMediaId)} accept={contentType === "image" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv"} onChange={(event) => void inspectSelection(event.target.files?.[0])}/><small>{contentType === "image" ? "JPG, PNG oder WebP · maximal 20 MB" : "MP4, WebM oder MOV · wird geprüft und automatisch displayfertig aufbereitet"}</small></label>{inspectionBusy && <div className="media-file-check checking" role="status"><i/><span><strong>Datei wird technisch geprüft …</strong><small>Auflösung, Laufzeit und Abspielbarkeit</small></span></div>}{inspection && <div className="media-file-check ready" role="status"><b>✓</b><span><strong>Technisch lesbar</strong><small>{mediaMetadataLabel(inspection.metadata)}{inspection.poster ? " · Vorschau erstellt" : ""}</small></span></div>}</> : <label>Text oder Beschreibung<textarea name="text" rows={5}/></label>}</> : <div className="date-pair"><label>Start<input name="startsAt" type="datetime-local" /></label><label>Ende<input name="endsAt" type="datetime-local" /></label></div>}{busy && isMedia && <div className={`upload-progress stage-${uploadStage}`} role="status"><span style={isProcessing ? undefined : { width: `${uploadStage === "ready" ? 100 : uploadProgress}%` }}/><small><strong>{progressTitle}</strong><em>{progressDetail}</em></small></div>}{error && <div className="form-error">{error}</div>}<button className="primary" disabled={busy || inspectionBusy || (isMedia && !inspection)}>{busy ? (isProcessing ? "Video wird aufbereitet …" : uploadStage === "ready" ? "Video ist displaybereit" : isMedia ? (uploadProgress >= 100 ? "Upload abgeschlossen · Verarbeitung startet" : `Datei wird übertragen${uploadProgress ? ` · ${uploadProgress} %` : " …"}`) : "Wird gespeichert …") : createdMediaId ? "Verfügbarkeit erneut prüfen" : inspectionBusy ? "Datei wird geprüft …" : isMedia ? (nested ? "Hochladen und auswählen" : "Datei hochladen") : "Inhalt speichern"}</button></form></section></div>;
}

registerServiceWorker({ scope: "/portal" });

function PortalEntry() {
  const params = new URLSearchParams(location.search);
  const invitationCallback = params.get("setup") === "1" || params.has("code") || /(?:^|&)type=invite(?:&|$)/.test(location.hash.slice(1));
  return invitationCallback ? <PortalAccessSetup/> : <Portal/>;
}

createRoot(document.getElementById("portal-root")!).render(<PortalEntry />);
