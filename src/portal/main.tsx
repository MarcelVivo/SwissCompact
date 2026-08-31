import React, { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { DetailedError, Upload } from "tus-js-client";
import "./portal.css";
import "./portal-media.css";
import "./portal-ai.css";
import "./portal-campaign.css";
import "./portal-devices.css";
import "./portal-records.css";

type PortalProfile = { displayName: string; email: string; tenantName: string; tenantSlug: string; role: "owner" | "admin" | "editor" | "viewer"; enabledModules: string[]; branding?: { accent?: string } };
type Site = { id: string; name: string; active: boolean; address?: Record<string, string> };
type Display = { id: string; name: string; kind: string; status: string; orientation?: string; resolution?: { width?: number; height?: number }; last_seen_at?: string; created_at?: string; creator_name?: string; site?: { name?: string } };
type Content = { id: string; title: string; content_type: string; status: string; payload?: { text?: string; uploadState?: string }; preview_url?: string | null; created_at?: string; creator_name?: string; updated_at: string };
type Campaign = { id: string; name: string; status: string; starts_at?: string; ends_at?: string; created_at?: string; creator_name?: string; updated_at: string; content_links?: Array<{ position: number; duration_seconds: number; content: { id: string; title: string; content_type: string; status: string } | null }>; display_links?: Array<{ display_id: string; display: { id: string; name: string; status: string; site?: { name?: string } } | null }> };
type Subscription = { package_code: string; status: string; starts_on: string; minimum_ends_on?: string; monthly_amount_chf?: number; included_ai_credits?: number } | null;
type Member = { id: string; role: string; display_name?: string; active: boolean };
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
type PortalData = { profile: PortalProfile; sites: Site[]; displays: Display[]; content: Content[]; campaigns: Campaign[]; subscription: Subscription; members: Member[]; aiCredits: AiCredits };
type View = "overview" | "content" | "campaigns" | "displays" | "settings";
type DeleteTarget = { kind: "content" | "campaign" | "display"; id: string; name: string };

type PreparedMediaUpload = {
  record: { id: string };
  upload: { signedUrl: string; token: string; path: string; resumableUrl: string };
};

const MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  mp4: "video/mp4", webm: "video/webm",
};

function mediaMimeType(file: File): string {
  const declared = file.type.toLowerCase().split(";", 1)[0];
  if (declared && declared !== "application/octet-stream") return declared;
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return MEDIA_MIME_BY_EXTENSION[extension] || declared;
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
  if (/mime|content.?type/i.test(detail)) return "Dieses Videoformat wird nicht unterstützt. Bitte verwenden Sie MP4 (H.264) oder WebM.";
  if (!navigator.onLine) return "Die Internetverbindung wurde unterbrochen. Bitte starten Sie den Upload erneut.";
  return detail ? `Die Datei konnte nicht übertragen werden: ${detail.slice(0, 240)}` : "Die Datei konnte nicht übertragen werden.";
}

function uploadVideo(file: File, prepared: PreparedMediaUpload, mimeType: string, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
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

const labels: Record<string, string> = {
  draft: "Entwurf", review: "Prüfung", approved: "Freigegeben", published: "Veröffentlicht", archived: "Archiviert",
  scheduled: "Geplant", active: "Aktiv", paused: "Pausiert", completed: "Abgeschlossen", online: "Online", offline: "Offline",
  maintenance: "Wartung", provisioning: "Einrichtung", owner: "Inhaber", admin: "Admin", editor: "Bearbeitung", viewer: "Lesen",
};

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Die Anfrage konnte nicht abgeschlossen werden.");
  return data as T;
}

function Icon({ name }: { name: View | "logout" | "plus" }) {
  const paths: Record<string, React.ReactNode> = {
    overview: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></>,
    content: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 15 3-3 3 3 2-2 3 3M8 9h.01"/></>,
    campaigns: <><path d="M4 13V7l14-3v12L4 13Z"/><path d="M7 13v6h4v-5"/></>,
    displays: <><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>,
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
    <section className="login-brand"><a className="wordmark" href="/">Swiss<span>Compact</span></a><p>Kundenportal</p><h1>Ihre digitale Kommunikation. Zentral gesteuert.</h1><p className="lead">Anzeigen, Medien und Bildschirme einfach verwalten – für alle Standorte.</p></section>
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

function Status({ value }: { value: string }) { return <span className={`status status-${value}`}>{labels[value] || value}</span>; }

function Empty({ children }: { children: React.ReactNode }) { return <div className="empty"><span>+</span><p>{children}</p></div>; }

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
  const firstLink = [...(campaign?.content_links || [])].sort((a, b) => a.position - b.position)[0];
  const related = firstLink?.content as unknown;
  const linkedContent = (Array.isArray(related) ? related[0] : related) as { id?: string } | null;
  const item = content.find((entry) => entry.id === linkedContent?.id);
  const state = live ? "Live" : planned ? "Geplant" : campaign ? "Noch nicht aktiviert" : "Kein Motiv zugeordnet";

  return <div className={`screen display-preview ${display.orientation === "portrait" ? "portrait" : ""} ${item ? "has-content" : ""}`}>
    {item?.preview_url && item.content_type === "image" ? <img src={item.preview_url} alt="" loading="lazy"/> : item?.preview_url && item.content_type === "video" ? <video src={item.preview_url} autoPlay muted loop playsInline preload="metadata"/> : item ? <div className="display-preview-text">{item.payload?.text || item.title}</div> : <div className="display-preview-brand">Swiss<span>Compact</span></div>}
    <div className="display-preview-meta"><span className={live ? "live" : planned ? "planned" : "inactive"}>{state}</span>{campaign && <strong>{campaign.name}</strong>}</div>
  </div>;
}

function Portal() {
  const [data, setData] = useState<PortalData | null>(null);
  const [session, setSession] = useState<"loading" | "guest" | "ready">("loading");
  const [view, setView] = useState<View>("overview");
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"content" | null>(null);
  const [aiDialog, setAiDialog] = useState(false);
  const [creditNotice, setCreditNotice] = useState<CreditPurchaseNotice | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [displaySetup, setDisplaySetup] = useState(false);
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [pairingBusyId, setPairingBusyId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const load = useCallback(async (): Promise<PortalData | null> => {
    setSession("loading"); setError("");
    try {
      const overview = await api<PortalData>("/api/dashboard/overview?audience=portal");
      if (!overview.profile || !Array.isArray(overview.displays) || !Array.isArray(overview.content) || !Array.isArray(overview.campaigns)) {
        throw new Error("Das Kundenportal wird gerade eingerichtet. Bitte versuchen Sie es in Kürze erneut.");
      }
      setData(overview); setSession("ready");
      return overview;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Portal nicht erreichbar";
      if (message === "Nicht angemeldet") setSession("guest"); else { setSession("guest"); setError(message); }
      return null;
    }
  }, []);
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
  const nav: Array<[View,string]> = [["overview","Übersicht"],["campaigns","Anzeigen"],["content","Medien & Vorlagen"],["displays","Bildschirme"],["settings","Einstellungen"]];
  async function logout() { await api("/api/dashboard/logout", { method: "POST", body: "{}" }).catch(() => undefined); setData(null); setSession("guest"); }
  async function setContentStatus(id: string, status: "approved" | "draft") {
    try {
      await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "update_content_status", id, status }) });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Status konnte nicht geändert werden"); }
  }
  function requestDelete(target: DeleteTarget) {
    setDeleteError("");
    setDeleteTarget(target);
  }
  async function confirmDelete() {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true); setDeleteError("");
    const action = deleteTarget.kind === "content" ? "delete_content" : deleteTarget.kind === "campaign" ? "delete_campaign" : "delete_display";
    try {
      await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action, id: deleteTarget.id }) });
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
  return <div className="portal" style={{ "--accent": data.profile.branding?.accent || "#d90d32" } as React.CSSProperties}>
    <aside><a className="wordmark" href="/">Swiss<span>Compact</span></a><div className="tenant"><span>Arbeitsbereich</span><strong>{data.profile.tenantName}</strong></div>
      <nav>{nav.map(([id,label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon name={id}/>{label}</button>)}</nav>
      <button className="logout" onClick={() => void logout()}><Icon name="logout"/>Abmelden</button>
    </aside>
    <main className="workspace"><header><div><div className="eyebrow">{data.profile.tenantName}</div><h1>{nav.find(([id]) => id === view)?.[1]}</h1></div><div className="profile"><span>{data.profile.displayName.slice(0,1).toUpperCase()}</span><div><strong>{data.profile.displayName}</strong><small>{labels[data.profile.role]}</small></div></div></header>
      {view === "overview" && <section className="view"><div className="welcome"><div><div className="eyebrow">Guten Tag, {data.profile.displayName.split(" ")[0]}</div><h2>Alles im Blick.</h2><p>Erstellen Sie eine Anzeige und wählen Sie danach Motiv, Bildschirm und Zeitraum.</p>{canEdit && <button className="primary welcome-action" onClick={() => setCreatingCampaign(true)}><Icon name="plus"/>Neue Anzeige erstellen</button>}</div><div className="pulse"><i></i>{online} von {data.displays.length} Bildschirmen online</div></div>
        <div className="portal-workflow" aria-label="Anzeige in vier Schritten erstellen"><button className={data.content.length ? "complete" : ""} onClick={() => setView("content")}><span>1</span><div><small>Schritt 1</small><strong>Motiv auswählen</strong></div><b>{data.content.length}</b></button><button className={data.displays.length ? "complete" : ""} onClick={() => setView("displays")}><span>2</span><div><small>Schritt 2</small><strong>Bildschirm wählen</strong></div><b>{data.displays.length}</b></button><button className={data.campaigns.length ? "complete" : ""} onClick={() => setView("campaigns")}><span>3</span><div><small>Schritt 3</small><strong>Zeitraum festlegen</strong></div><b>{data.campaigns.length}</b></button><button className={data.campaigns.some((item) => ["active","scheduled"].includes(item.status)) ? "complete" : ""} onClick={() => setView("campaigns")}><span>4</span><div><small>Schritt 4</small><strong>Prüfen & starten</strong></div><b>{data.campaigns.filter((item) => ["active","scheduled"].includes(item.status)).length}</b></button></div>
        <div className="metrics"><article><span>Bildschirme</span><strong>{data.displays.length}</strong><small>{online} online</small></article><article><span>Medien</span><strong>{data.content.length}</strong><small>{data.content.filter((item) => item.status === "published").length} veröffentlicht</small></article><article><span>Anzeigen</span><strong>{data.campaigns.length}</strong><small>{data.campaigns.filter((item) => item.status === "active").length} aktiv</small></article><article><span>Standorte</span><strong>{data.sites.length}</strong><small>{data.sites.filter((item) => item.active).length} verbunden</small></article></div>
        <div className="split"><section className="card"><div className="card-head"><div><span>Aktuelle Anzeigen</span><h3>Planung & Ausspielung</h3></div><button onClick={() => setView("campaigns")}>Alle ansehen</button></div>{data.campaigns.length ? data.campaigns.slice(0,4).map((item) => <div className="row" key={item.id}><div><strong>{item.name}</strong><small>Aktualisiert {new Date(item.updated_at).toLocaleDateString("de-CH")} · Erstellt von {item.creator_name || "Nicht erfasst"}</small></div><Status value={item.status}/></div>) : <Empty>Noch keine Anzeigen vorhanden.</Empty>}</section>
          <section className="card"><div className="card-head"><div><span>Bildschirm-Status</span><h3>Ihre Flächen</h3></div><button onClick={() => setView("displays")}>Alle ansehen</button></div>{data.displays.length ? data.displays.slice(0,4).map((item) => <div className="row" key={item.id}><div><strong>{item.name}</strong><small>{item.site?.name || "Ohne Standort"} · Erstellt von {item.creator_name || "Nicht erfasst"}</small></div><Status value={item.status}/></div>) : <Empty>Noch keine Bildschirme verbunden.</Empty>}</section></div>
      </section>}
      {view === "content" && <section className="view"><div className="section-title"><div><h2>Medien & Vorlagen</h2><p>Bilder, Videos und Vorlagen für Ihre Anzeigen.</p></div>{canEdit && <div className="content-create-actions"><button className="secondary compact ai-create" onClick={() => setAiDialog(true)}><span>✦</span>KI-Bild <b>{data.aiCredits?.balance?.available ?? "–"}</b></button><button className="primary compact" onClick={() => setDialog("content")}><Icon name="plus"/>Medium hinzufügen</button></div>}</div><div className="content-grid">{data.content.map((item) => <article className="content-card" key={item.id}><div className={`content-preview type-${item.content_type}`}>{item.preview_url && item.content_type === "image" ? <img src={item.preview_url} alt="" loading="lazy"/> : item.preview_url && item.content_type === "video" ? <video src={item.preview_url} muted playsInline preload="metadata"/> : null}<span>{item.payload?.uploadState === "uploading" ? "UPLOAD LÄUFT" : item.content_type.toUpperCase()}</span></div><div><Status value={item.status}/><h3>{item.title}</h3><p>{item.payload?.text || (item.content_type === "image" ? "Bildmedium" : item.content_type === "video" ? "Videomedium" : "Noch keine Beschreibung")}</p><small>Geändert {new Date(item.updated_at).toLocaleDateString("de-CH")}</small><small className="creator-meta">Erstellt von {item.creator_name || "Nicht erfasst"}</small>{canEdit && <div className="record-actions">{item.payload?.uploadState !== "uploading" && <button className="content-status-action" onClick={() => void setContentStatus(item.id, ["approved", "published"].includes(item.status) ? "draft" : "approved")}>{["approved", "published"].includes(item.status) ? "Freigabe zurückziehen" : "Für Bildschirme freigeben"}</button>}<button type="button" className="delete-record-action" onClick={() => requestDelete({ kind: "content", id: item.id, name: item.title })}>Löschen</button></div>}</div></article>)}{!data.content.length && <Empty>Fügen Sie Ihr erstes Bild, Video oder eine Vorlage hinzu.</Empty>}</div></section>}
      {view === "campaigns" && <section className="view"><div className="section-title"><div><h2>Anzeigen</h2><p>Motiv, Bildschirm und Zeitraum einfach zusammenstellen.</p></div>{canEdit && <button className="primary compact" onClick={() => setCreatingCampaign(true)}><Icon name="plus"/>Neue Anzeige</button>}</div><div className="table-card"><div className="table-head campaign-table"><span>Name</span><span>Zeitraum</span><span>Erstellt von</span><span>Status</span><span></span></div>{data.campaigns.map((item) => <div className="table-row campaign-table" key={item.id}><strong>{item.name}</strong><span>{item.starts_at ? new Date(item.starts_at).toLocaleDateString("de-CH") : "Offen"} – {item.ends_at ? new Date(item.ends_at).toLocaleDateString("de-CH") : "Offen"}</span><span className="creator-meta">{item.creator_name || "Nicht erfasst"}</span><Status value={item.status}/><div className="campaign-row-actions"><button className="row-action" onClick={() => setEditingCampaign(item)}>{canEdit ? "Bearbeiten" : "Ansehen"}</button>{canEdit && <button type="button" className="delete-record-action" onClick={() => requestDelete({ kind: "campaign", id: item.id, name: item.name })}>Löschen</button>}</div></div>)}{!data.campaigns.length && <Empty>Erstellen Sie Ihre erste Anzeige.</Empty>}</div></section>}
      {view === "displays" && <section className="view"><div className="section-title"><div><h2>Bildschirme</h2><p>Alle verbundenen Flächen und ihre aktuell laufenden Anzeigen.</p></div>{canManageDevices && <button className="primary compact" onClick={() => setDisplaySetup(true)}><Icon name="plus"/>Bildschirm einrichten</button>}</div><div className="display-grid">{data.displays.map((item) => <article className="display-card" key={item.id}><DisplayPreview display={item} campaigns={data.campaigns} content={data.content}/><div><Status value={item.status}/><h3>{item.name}</h3><p>{item.site?.name || "Standort noch nicht zugewiesen"}</p><small>{item.resolution?.width ? `${item.resolution.width} × ${item.resolution.height}` : "Auflösung nicht erfasst"}</small><small className="creator-meta">Erstellt von {item.creator_name || "Nicht erfasst"}</small>{canManageDevices && <div className="record-actions"><button type="button" className="device-link" disabled={Boolean(pairingBusyId)} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void createPairing(item); }}>{pairingBusyId === item.id ? "Code wird erstellt …" : item.status === "provisioning" ? "Aktivierungscode erstellen" : "Bildschirm neu verbinden"}</button><button type="button" className="delete-record-action" onClick={() => requestDelete({ kind: "display", id: item.id, name: item.name })}>Löschen</button></div>}</div></article>)}{!data.displays.length && <Empty>Richten Sie Ihren ersten Bildschirm ein.</Empty>}</div></section>}
      {view === "settings" && <section className="view"><div className="section-title"><div><h2>Konto & Service</h2><p>Ihr Portalzugang und das aktive SwissCompact-Paket.</p></div></div><div className="settings-grid"><article className="card plan"><span>Aktives Paket</span><h3>{data.subscription?.package_code || "Noch nicht zugewiesen"}</h3><Status value={data.subscription?.status || "paused"}/><p>Software, Portal, Wartung, Fehlerbehebung und kleinere Anpassungen – zentral betreut durch SwissCompact.</p>{data.subscription?.minimum_ends_on && <small>Mindestlaufzeit bis {new Date(data.subscription.minimum_ends_on).toLocaleDateString("de-CH")}</small>}</article><article className="card"><span>Portalzugänge</span><h3>{data.members.length} Benutzer</h3>{data.members.map((member) => <div className="row" key={member.id}><strong>{member.display_name || "Portalbenutzer"}</strong><span>{labels[member.role] || member.role}</span></div>)}</article><article className="card support"><span>SwissCompact Support</span><h3>Wir sind für Sie da.</h3><p>Für technische Fragen, neue Displays oder Unterstützung bei Ihren Inhalten.</p><a href="mailto:kontakt@swisscompact.com">kontakt@swisscompact.com</a></article></div></section>}
    </main>
    {dialog && <CreateDialog type={dialog} onClose={() => setDialog(null)} onCreated={() => { setDialog(null); void load(); }} />}
    {aiDialog && <AiImageDialog credits={data.aiCredits} canBuy={canManageDevices} checkoutNotice={creditNotice} onDismissCheckoutNotice={() => setCreditNotice(null)} onClose={() => setAiDialog(false)} onCreated={() => { setAiDialog(false); void load(); }} />}
    {(creatingCampaign || editingCampaign) && <CampaignEditor campaign={editingCampaign} content={data.content} displays={data.displays} canEdit={canEdit} canManageDevices={canManageDevices} onCreateContent={() => { setCreatingCampaign(false); setEditingCampaign(null); setView("content"); setDialog("content"); }} onCreateDisplay={() => { setCreatingCampaign(false); setEditingCampaign(null); setView("displays"); setDisplaySetup(true); }} onClose={() => { setCreatingCampaign(false); setEditingCampaign(null); }} onSaved={() => { setCreatingCampaign(false); setEditingCampaign(null); void load(); }} />}
    {displaySetup && <DisplaySetupDialog sites={data.sites} onClose={() => setDisplaySetup(false)} onCreated={(next) => { setDisplaySetup(false); setPairing(next); void load(); }} />}
    {pairing && <PairingDialog pairing={pairing} onClose={() => setPairing(null)} />}
    {deleteTarget && <DeleteDialog target={deleteTarget} busy={deleteBusy} error={deleteError} onCancel={() => !deleteBusy && setDeleteTarget(null)} onConfirm={() => void confirmDelete()} />}
    {error && <div className="global-message" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Meldung schließen">×</button></div>}
  </div>;
}

function DeleteDialog({ target, busy, error, onCancel, onConfirm }: { target: DeleteTarget; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void }) {
  const labelsByKind = {
    content: { eyebrow: "Medium löschen", noun: "Medium", detail: "Das Medium wird dauerhaft entfernt. Wird es noch aktiv ausgespielt, löschen oder bearbeiten Sie zuerst die zugehörige Anzeige." },
    campaign: { eyebrow: "Anzeige löschen", noun: "Anzeige", detail: "Die Anzeige sowie ihre Motiv- und Bildschirm-Zuordnungen werden dauerhaft gelöscht. Eine laufende oder geplante Ausspielung wird dabei sofort beendet." },
    display: { eyebrow: "Bildschirm löschen", noun: "Bildschirm", detail: "Der Bildschirm, seine Geräteverbindung und alle Anzeigen-Zuordnungen werden dauerhaft entfernt." },
  } as const;
  const copy = labelsByKind[target.kind];
  return <div className="dialog-backdrop delete-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}><section className="dialog delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title"><button className="dialog-close" onClick={onCancel} disabled={busy} aria-label="Schließen">×</button><div className="eyebrow">{copy.eyebrow}</div><h2 id="delete-dialog-title">„{target.name}“ wirklich löschen?</h2><p>{copy.detail}</p><div className="delete-warning"><strong>Diese Aktion kann nicht rückgängig gemacht werden.</strong><span>{copy.noun} und zugehörige Verknüpfungen werden endgültig entfernt.</span></div>{error && <div className="form-error" role="alert">{error}</div>}<footer className="delete-dialog-actions"><button type="button" className="secondary" onClick={onCancel} disabled={busy}>Abbrechen</button><button type="button" className="delete-confirm" onClick={onConfirm} disabled={busy}>{busy ? "Wird gelöscht …" : `${copy.noun} löschen`}</button></footer></section></div>;
}

function DisplaySetupDialog({ sites, onClose, onCreated }: { sites: Site[]; onClose: () => void; onCreated: (pairing: PairingInfo) => void }) {
  const [siteMode, setSiteMode] = useState(sites.length ? "existing" : "new");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      let siteId = String(form.get("siteId") || "");
      if (siteMode === "new") {
        const site = await api<{ record: Site }>("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "create_site", name: form.get("siteName") }) });
        siteId = site.record.id;
      }
      const display = await api<{ record: { name: string }; pairing: PairingInfo }>("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "create_display", name: form.get("name"), siteId, kind: form.get("kind"), orientation: form.get("orientation") }) });
      onCreated({ ...display.pairing, displayName: display.record.name });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Bildschirm konnte nicht eingerichtet werden"); }
    finally { setBusy(false); }
  }
  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="dialog" role="dialog" aria-modal="true"><button className="dialog-close" onClick={onClose}>×</button><div className="eyebrow">Geräteverwaltung</div><h2>Bildschirm einrichten</h2><form onSubmit={submit}><label>Bildschirmname<input name="name" required autoFocus placeholder="z. B. Schaufenster links"/></label><div className="date-pair"><label>Gerätetyp<select name="kind"><option value="display">Bildschirm</option><option value="led_wall">LED-Wand</option><option value="led_controller">LED-Controller</option><option value="player">Player</option></select></label><label>Ausrichtung<select name="orientation"><option value="landscape">Querformat</option><option value="portrait">Hochformat</option><option value="custom">Individuell</option></select></label></div>{sites.length > 0 && <label>Standorttyp<select value={siteMode} onChange={(event) => setSiteMode(event.target.value)}><option value="existing">Bestehender Standort</option><option value="new">Neuer Standort</option></select></label>}{siteMode === "existing" ? <label>Standort<select name="siteId" required>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label> : <label>Neuer Standort<input name="siteName" required placeholder="z. B. Filiale Bern"/></label>}{error && <div className="form-error">{error}</div>}<button className="primary" disabled={busy}>{busy ? "Wird vorbereitet …" : "Bildschirm vorbereiten"}</button></form></section></div>;
}

function PairingDialog({ pairing, onClose }: { pairing: PairingInfo; onClose: () => void }) {
  const playerUrl = `${location.origin}/player?display=${encodeURIComponent(pairing.displayId)}&pair=1`;
  const [copied, setCopied] = useState(false);
  async function copy() { await navigator.clipboard.writeText(`${playerUrl}\nAktivierungscode: ${pairing.code}`); setCopied(true); }
  return <div className="dialog-backdrop"><section className="dialog pairing-result" role="dialog" aria-modal="true"><button className="dialog-close" onClick={onClose}>×</button><div className="eyebrow">Einmaliger Aktivierungscode</div><h2>{pairing.displayName || "Bildschirm"}</h2><p>Öffnen Sie den Player auf dem Abspielgerät und geben Sie diesen Code ein.</p><div className="pairing-code">{pairing.code}</div><div className="pairing-meta"><span>Bildschirm-ID</span><code>{pairing.displayId}</code><span>Player-Adresse</span><a href={playerUrl} target="_blank" rel="noreferrer">{playerUrl}</a></div><button className="primary" onClick={() => void copy()}>{copied ? "Kopiert" : "Adresse und Code kopieren"}</button><small>Gültig bis {new Date(pairing.expiresAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })} Uhr. Danach kann jederzeit ein neuer Code erstellt werden.</small></section></div>;
}

function localDateTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function CampaignEditor({ campaign, content, displays, canEdit, canManageDevices, onCreateContent, onCreateDisplay, onClose, onSaved }: { campaign: Campaign | null; content: Content[]; displays: Display[]; canEdit: boolean; canManageDevices: boolean; onCreateContent: () => void; onCreateDisplay: () => void; onClose: () => void; onSaved: () => void }) {
  const initialContent = [...(campaign?.content_links || [])].sort((a,b) => a.position - b.position).flatMap((link) => link.content ? [{ contentId: link.content.id, durationSeconds: link.duration_seconds || 10 }] : []);
  const [playlist, setPlaylist] = useState(initialContent);
  const [selectedDisplays, setSelectedDisplays] = useState(() => new Set((campaign?.display_links || []).map((link) => link.display_id)));
  const [name, setName] = useState(campaign?.name || "");
  const [startsAt, setStartsAt] = useState(() => localDateTime(campaign?.starts_at || new Date().toISOString()));
  const [endsAt, setEndsAt] = useState(() => localDateTime(campaign?.ends_at || new Date(Date.now() + 7 * 86_400_000).toISOString()));
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = Boolean(campaign && ["active", "scheduled", "completed", "archived"].includes(campaign.status));
  const availableContent = content.filter((item) => item.payload?.uploadState !== "uploading");
  const selectedContent = playlist.flatMap((entry) => {
    const item = content.find((candidate) => candidate.id === entry.contentId);
    return item ? [item] : [];
  });
  const chosenDisplays = displays.filter((display) => selectedDisplays.has(display.id));
  const hasUnapprovedContent = selectedContent.some((item) => !["approved", "published"].includes(item.status));

  function toggleContent(contentId: string) {
    setPlaylist((current) => current.some((item) => item.contentId === contentId) ? current.filter((item) => item.contentId !== contentId) : [...current, { contentId, durationSeconds: 10 }]);
  }
  function move(index: number, direction: -1 | 1) {
    setPlaylist((current) => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }
  function toggleDisplay(displayId: string) {
    setSelectedDisplays((current) => { const next = new Set(current); if (next.has(displayId)) next.delete(displayId); else next.add(displayId); return next; });
  }
  function nextStep() {
    setError("");
    if (step === 1 && !name.trim()) { setError("Geben Sie Ihrer Anzeige einen kurzen Namen."); return; }
    if (step === 1 && !playlist.length) { setError("Wählen Sie mindestens ein Motiv aus."); return; }
    if (step === 2 && !selectedDisplays.size) { setError("Wählen Sie mindestens einen Bildschirm aus."); return; }
    if (step === 3 && startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) { setError("Das Ende muss nach dem Start liegen."); return; }
    setStep((current) => Math.min(4, current + 1));
  }
  async function save(activate = false) {
    setBusy(true); setError("");
    try {
      let campaignId = campaign?.id;
      if (!campaignId) {
        const created = await api<{ record: Campaign }>("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "create_campaign", name, startsAt: startsAt ? new Date(startsAt).toISOString() : null, endsAt: endsAt ? new Date(endsAt).toISOString() : null }) });
        campaignId = created.record.id;
      }
      await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "configure_campaign", id: campaignId, name, startsAt: startsAt ? new Date(startsAt).toISOString() : null, endsAt: endsAt ? new Date(endsAt).toISOString() : null, contentItems: playlist, displayIds: [...selectedDisplays] }) });
      if (activate) await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "activate_campaign", id: campaignId }) });
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Anzeige konnte nicht gespeichert werden"); }
    finally { setBusy(false); }
  }
  async function pause() {
    setBusy(true); setError("");
    try { if (campaign) await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "pause_campaign", id: campaign.id }) }); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Anzeige konnte nicht pausiert werden"); } finally { setBusy(false); }
  }
  const stepLabels = ["Motiv", "Bildschirm", "Zeitraum", "Vorschau & Start"];
  return <div className="dialog-backdrop campaign-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="dialog campaign-editor" role="dialog" aria-modal="true"><button className="dialog-close" onClick={onClose} aria-label="Schließen">×</button><div className="campaign-editor-head"><div><div className="eyebrow">Anzeige erstellen</div><h2>{name || "Neue Anzeige"}</h2></div>{campaign && <Status value={campaign.status}/>}</div>
    <div className="wizard-progress" aria-label={`Schritt ${step} von 4`}>{stepLabels.map((label, index) => <div className={`${step === index + 1 ? "active" : ""} ${step > index + 1 ? "complete" : ""}`} key={label}><span>{step > index + 1 ? "✓" : index + 1}</span><strong>{label}</strong></div>)}</div>
    {locked && <div className="editor-notice">Diese Anzeige läuft bereits. Pausieren Sie sie, bevor Sie Motiv, Bildschirm oder Zeitraum ändern.</div>}
    <div className="wizard-stage">
      {step === 1 && <section><div className="wizard-stage-head"><div><span>Schritt 1</span><h3>Was möchten Sie zeigen?</h3><p>Geben Sie der Anzeige einen Namen und wählen Sie mindestens ein Motiv.</p></div></div><label className="wizard-name">Name der Anzeige<input value={name} autoFocus onChange={(event) => setName(event.target.value)} disabled={!canEdit || locked} placeholder="z. B. Sonntagsbrunch oder Sommeraktion"/></label><div className="selection-list media-selection">{availableContent.map((item) => { const index = playlist.findIndex((entry) => entry.contentId === item.id); const selected = index >= 0; return <div className={`selection-row ${selected ? "selected" : ""}`} key={item.id}><label><input type="checkbox" checked={selected} onChange={() => toggleContent(item.id)} disabled={!canEdit || locked}/><span><strong>{item.title}</strong><small>{item.content_type.toUpperCase()} · {labels[item.status] || item.status}</small></span></label>{selected && <div className="playlist-controls"><button type="button" aria-label="Nach oben" onClick={() => move(index,-1)} disabled={index === 0 || locked}>↑</button><button type="button" aria-label="Nach unten" onClick={() => move(index,1)} disabled={index === playlist.length-1 || locked}>↓</button><label><input type="number" min="5" max="3600" value={playlist[index].durationSeconds} onChange={(event) => setPlaylist((current) => current.map((entry,i) => i === index ? {...entry,durationSeconds:Number(event.target.value)} : entry))} disabled={!canEdit || locked}/><span>Sek.</span></label></div>}</div>})}{!availableContent.length && <div className="wizard-empty"><strong>Noch kein Motiv vorhanden</strong><p>Fügen Sie ein Bild, Video oder KI-Motiv hinzu und beginnen Sie danach erneut.</p>{canEdit && <button type="button" className="secondary" onClick={onCreateContent}>Motiv hinzufügen</button>}</div>}</div></section>}
      {step === 2 && <section><div className="wizard-stage-head"><div><span>Schritt 2</span><h3>Wo soll die Anzeige erscheinen?</h3><p>Wählen Sie einen oder mehrere Bildschirme.</p></div><b>{selectedDisplays.size} gewählt</b></div><div className="selection-list display-selection">{displays.map((display) => <label className={selectedDisplays.has(display.id) ? "selected" : ""} key={display.id}><input type="checkbox" checked={selectedDisplays.has(display.id)} onChange={() => toggleDisplay(display.id)} disabled={!canEdit || locked}/><span><strong>{display.name}</strong><small>{display.site?.name || "Ohne Standort"} · {labels[display.status] || display.status}</small></span></label>)}{!displays.length && <div className="wizard-empty"><strong>Noch kein Bildschirm verbunden</strong><p>Verbinden Sie zuerst Ihre Anzeigefläche und beginnen Sie danach erneut.</p>{canManageDevices && <button type="button" className="secondary" onClick={onCreateDisplay}>Bildschirm einrichten</button>}</div>}</div></section>}
      {step === 3 && <section><div className="wizard-stage-head"><div><span>Schritt 3</span><h3>Wann soll die Anzeige laufen?</h3><p>Der vorgeschlagene Zeitraum beträgt sieben Tage und kann frei geändert werden.</p></div></div><div className="wizard-date-pair"><label>Start<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} disabled={!canEdit || locked}/><small>Ab diesem Zeitpunkt wird die Anzeige sichtbar.</small></label><label>Ende<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} disabled={!canEdit || locked}/><small>Danach wird die Anzeige automatisch beendet.</small></label></div></section>}
      {step === 4 && <section><div className="wizard-stage-head"><div><span>Schritt 4</span><h3>Alles bereit?</h3><p>Prüfen Sie die Zusammenfassung und starten Sie die Anzeige.</p></div></div><div className="wizard-review"><div className="wizard-preview">{selectedContent[0]?.preview_url && selectedContent[0].content_type === "image" ? <img src={selectedContent[0].preview_url} alt="Vorschau des gewählten Motivs"/> : selectedContent[0]?.preview_url && selectedContent[0].content_type === "video" ? <video src={selectedContent[0].preview_url} muted playsInline/> : <div><span>Vorschau</span><strong>{selectedContent[0]?.title || "Kein Motiv"}</strong></div>}</div><div className="wizard-summary"><div><span>Anzeige</span><strong>{name || "Ohne Namen"}</strong></div><div><span>Motiv</span><strong>{selectedContent.map((item) => item.title).join(", ") || "Nicht gewählt"}</strong></div><div><span>Bildschirm</span><strong>{chosenDisplays.map((item) => item.name).join(", ") || "Nicht gewählt"}</strong></div><div><span>Zeitraum</span><strong>{startsAt ? new Date(startsAt).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" }) : "Sofort"} – {endsAt ? new Date(endsAt).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" }) : "Offen"}</strong></div></div></div>{hasUnapprovedContent && <div className="editor-notice">Mindestens ein Motiv ist noch nicht freigegeben. Speichern Sie den Entwurf und geben Sie das Motiv unter „Medien & Vorlagen“ frei.</div>}</section>}
    </div>
    {error && <div className="form-error">{error}</div>}<footer className="editor-actions"><button className="secondary" onClick={onClose}>Schließen</button>{canEdit && campaign && (campaign.status === "active" || campaign.status === "scheduled") && <button className="secondary danger" onClick={() => void pause()} disabled={busy}>Anzeige pausieren</button>}{step > 1 && <button className="secondary" onClick={() => { setError(""); setStep((current) => current - 1); }} disabled={busy}>Zurück</button>}{step < 4 && <button className="primary" onClick={nextStep}>Weiter</button>}{canEdit && !locked && step === 4 && <><button className="secondary" onClick={() => void save(false)} disabled={busy}>Als Entwurf speichern</button><button className="primary" onClick={() => void save(true)} disabled={busy || hasUnapprovedContent}>{busy ? "Wird gespeichert …" : startsAt && new Date(startsAt) > new Date() ? "Anzeige planen" : "Jetzt anzeigen"}</button></>}</footer>
  </section></div>;
}

function AiImageDialog({ credits, canBuy, checkoutNotice, onDismissCheckoutNotice, onClose, onCreated }: { credits: AiCredits; canBuy: boolean; checkoutNotice: CreditPurchaseNotice | null; onDismissCheckoutNotice: () => void; onClose: () => void; onCreated: () => void }) {
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
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        if (response.status !== 409) setGenerationKey(crypto.randomUUID());
        throw new Error(result.error || "Das Bild konnte nicht erstellt werden");
      }
      onCreated();
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

  return <div className="dialog-backdrop ai-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && !buying && onClose()}><section className={`dialog ai-dialog ${checkoutNotice ? "has-credit-notice" : ""}`} role="dialog" aria-modal="true"><button className="dialog-close" onClick={onClose} disabled={busy || Boolean(buying)} aria-label="Schließen">×</button>
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

function CreateDialog({ type, onClose, onCreated }: { type: "content" | "campaign"; onClose: () => void; onCreated: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [contentType, setContentType] = useState("composition");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setUploadProgress(0); const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "");
    const body = type === "content" ? { action: "create_content", title, contentType: form.get("contentType"), text: form.get("text") } : { action: "create_campaign", name: title, startsAt: form.get("startsAt") || null, endsAt: form.get("endsAt") || null };
    let preparedId = "";
    try {
      const file = form.get("file");
      if (type === "content" && (contentType === "image" || contentType === "video")) {
        if (!(file instanceof File) || !file.size) throw new Error("Bitte wählen Sie eine Datei aus.");
        const mimeType = mediaMimeType(file);
        const prepared = await api<PreparedMediaUpload>("/api/dashboard/records?audience=portal", {
          method: "POST",
          body: JSON.stringify({ action: "prepare_media_upload", title, mimeType, sizeBytes: file.size }),
        });
        preparedId = prepared.record.id;
        if (contentType === "video") {
          await uploadVideo(file, prepared, mimeType, setUploadProgress);
        } else {
          const uploadBody = new FormData();
          uploadBody.append("cacheControl", "3600");
          uploadBody.append("", file);
          const uploaded = await fetch(prepared.upload.signedUrl, { method: "PUT", body: uploadBody, headers: { "x-upsert": "false" } });
          if (!uploaded.ok) {
            const detail = await uploaded.text().catch(() => "");
            throw new Error(detail || `${uploaded.status} ${uploaded.statusText}`);
          }
          setUploadProgress(100);
        }
        await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "finalize_media_upload", id: prepared.record.id }) });
      } else {
        await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify(body) });
      }
      onCreated();
    }
    catch (reason) {
      if (preparedId) await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify({ action: "cancel_media_upload", id: preparedId }) }).catch(() => undefined);
      setError(preparedId ? storageUploadMessage(reason) : reason instanceof Error ? reason.message : "Speichern fehlgeschlagen");
    } finally { setBusy(false); }
  }
  const isMedia = contentType === "image" || contentType === "video";
  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="dialog" role="dialog" aria-modal="true"><button className="dialog-close" onClick={onClose} aria-label="Schließen">×</button><div className="eyebrow">{type === "content" ? "Medien & Vorlagen" : "Anzeigen"}</div><h2>{type === "content" ? "Neues Medium hinzufügen" : "Neue Anzeige erstellen"}</h2><form onSubmit={submit}><label>{type === "content" ? "Titel" : "Name der Anzeige"}<input name="title" required autoFocus /></label>{type === "content" ? <><label>Medientyp<select name="contentType" value={contentType} onChange={(event) => setContentType(event.target.value)}><option value="composition">Komposition</option><option value="text">Text</option><option value="image">Bild hochladen</option><option value="video">Video hochladen</option><option value="web">Web-Inhalt</option></select></label>{isMedia ? <label className="file-field"><span>{contentType === "image" ? "Bilddatei" : "Videodatei"}</span><input name="file" type="file" required accept={contentType === "image" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/webm,.mp4,.webm"}/><small>{contentType === "image" ? "JPG, PNG oder WebP · maximal 20 MB" : "MP4 (H.264) oder WebM · maximal 250 MB"}</small></label> : <label>Text oder Beschreibung<textarea name="text" rows={5}/></label>}</> : <div className="date-pair"><label>Start<input name="startsAt" type="datetime-local" /></label><label>Ende<input name="endsAt" type="datetime-local" /></label></div>}{busy && isMedia && <div className="upload-progress" role="status"><span style={{ width: `${uploadProgress}%` }}/><small>{uploadProgress > 0 ? `${uploadProgress} % übertragen` : "Upload wird vorbereitet …"}</small></div>}{error && <div className="form-error">{error}</div>}<button className="primary" disabled={busy}>{busy ? (isMedia ? `Datei wird übertragen${uploadProgress ? ` · ${uploadProgress} %` : " …"}` : "Wird gespeichert …") : "Als Entwurf speichern"}</button></form></section></div>;
}

createRoot(document.getElementById("portal-root")!).render(<Portal />);
