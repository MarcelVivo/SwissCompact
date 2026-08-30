import React, { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./portal.css";

type PortalProfile = { displayName: string; email: string; tenantName: string; tenantSlug: string; role: "owner" | "admin" | "editor" | "viewer"; enabledModules: string[]; branding?: { accent?: string } };
type Site = { id: string; name: string; active: boolean; address?: Record<string, string> };
type Display = { id: string; name: string; kind: string; status: string; orientation?: string; resolution?: { width?: number; height?: number }; last_seen_at?: string; site?: { name?: string } };
type Content = { id: string; title: string; content_type: string; status: string; payload?: { text?: string }; updated_at: string };
type Campaign = { id: string; name: string; status: string; starts_at?: string; ends_at?: string; updated_at: string };
type Subscription = { package_code: string; status: string; starts_on: string; minimum_ends_on?: string; monthly_amount_chf?: number; included_ai_credits?: number } | null;
type Member = { id: string; role: string; display_name?: string; active: boolean };
type PortalData = { profile: PortalProfile; sites: Site[]; displays: Display[]; content: Content[]; campaigns: Campaign[]; subscription: Subscription; members: Member[] };
type View = "overview" | "content" | "campaigns" | "displays" | "settings";

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
    <section className="login-brand"><a className="wordmark" href="/">Swiss<span>Compact</span></a><p>Kundenportal</p><h1>Ihre digitale Kommunikation. Zentral gesteuert.</h1><p className="lead">Displays, Inhalte und Kampagnen einfach verwalten – für alle Standorte.</p></section>
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

function Portal() {
  const [data, setData] = useState<PortalData | null>(null);
  const [session, setSession] = useState<"loading" | "guest" | "ready">("loading");
  const [view, setView] = useState<View>("overview");
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"content" | "campaign" | null>(null);
  const load = useCallback(async () => {
    setSession("loading"); setError("");
    try {
      const overview = await api<PortalData>("/api/dashboard/overview?audience=portal");
      if (!overview.profile || !Array.isArray(overview.displays) || !Array.isArray(overview.content) || !Array.isArray(overview.campaigns)) {
        throw new Error("Das Kundenportal wird gerade eingerichtet. Bitte versuchen Sie es in Kürze erneut.");
      }
      setData(overview); setSession("ready");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Portal nicht erreichbar";
      if (message === "Nicht angemeldet") setSession("guest"); else { setSession("guest"); setError(message); }
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const online = useMemo(() => data?.displays?.filter((display) => display.status === "online").length || 0, [data]);
  if (session === "loading") return <div className="boot"><div className="boot-mark">SC</div><span>Portal wird geladen</span></div>;
  if (session === "guest" || !data) return <><Login onDone={() => void load()} />{error && <div className="global-message">{error}</div>}</>;
  const canEdit = data.profile.role !== "viewer";
  const nav: Array<[View,string]> = [["overview","Übersicht"],["content","Inhalte"],["campaigns","Kampagnen"],["displays","Displays"],["settings","Einstellungen"]];
  async function logout() { await api("/api/dashboard/logout", { method: "POST", body: "{}" }).catch(() => undefined); setData(null); setSession("guest"); }
  return <div className="portal" style={{ "--accent": data.profile.branding?.accent || "#d90d32" } as React.CSSProperties}>
    <aside><a className="wordmark" href="/">Swiss<span>Compact</span></a><div className="tenant"><span>Arbeitsbereich</span><strong>{data.profile.tenantName}</strong></div>
      <nav>{nav.map(([id,label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon name={id}/>{label}</button>)}</nav>
      <button className="logout" onClick={() => void logout()}><Icon name="logout"/>Abmelden</button>
    </aside>
    <main className="workspace"><header><div><div className="eyebrow">{data.profile.tenantName}</div><h1>{nav.find(([id]) => id === view)?.[1]}</h1></div><div className="profile"><span>{data.profile.displayName.slice(0,1).toUpperCase()}</span><div><strong>{data.profile.displayName}</strong><small>{labels[data.profile.role]}</small></div></div></header>
      {view === "overview" && <section className="view"><div className="welcome"><div><div className="eyebrow">Guten Tag, {data.profile.displayName.split(" ")[0]}</div><h2>Alles im Blick.</h2><p>Steuern Sie Ihre digitalen Flächen, Inhalte und Kampagnen von einem Ort aus.</p></div><div className="pulse"><i></i>{online} von {data.displays.length} Displays online</div></div>
        <div className="metrics"><article><span>Displays</span><strong>{data.displays.length}</strong><small>{online} online</small></article><article><span>Inhalte</span><strong>{data.content.length}</strong><small>{data.content.filter((item) => item.status === "published").length} veröffentlicht</small></article><article><span>Kampagnen</span><strong>{data.campaigns.length}</strong><small>{data.campaigns.filter((item) => item.status === "active").length} aktiv</small></article><article><span>Standorte</span><strong>{data.sites.length}</strong><small>{data.sites.filter((item) => item.active).length} verbunden</small></article></div>
        <div className="split"><section className="card"><div className="card-head"><div><span>Aktuelle Kampagnen</span><h3>Planung & Ausspielung</h3></div><button onClick={() => setView("campaigns")}>Alle ansehen</button></div>{data.campaigns.length ? data.campaigns.slice(0,4).map((item) => <div className="row" key={item.id}><div><strong>{item.name}</strong><small>Aktualisiert {new Date(item.updated_at).toLocaleDateString("de-CH")}</small></div><Status value={item.status}/></div>) : <Empty>Noch keine Kampagnen vorhanden.</Empty>}</section>
          <section className="card"><div className="card-head"><div><span>Display-Status</span><h3>Ihre Flächen</h3></div><button onClick={() => setView("displays")}>Alle ansehen</button></div>{data.displays.length ? data.displays.slice(0,4).map((item) => <div className="row" key={item.id}><div><strong>{item.name}</strong><small>{item.site?.name || "Ohne Standort"}</small></div><Status value={item.status}/></div>) : <Empty>Noch keine Displays verbunden.</Empty>}</section></div>
      </section>}
      {view === "content" && <section className="view"><div className="section-title"><div><h2>Content-Bibliothek</h2><p>Medien und Inhalte für Ihre digitalen Flächen.</p></div>{canEdit && <button className="primary compact" onClick={() => setDialog("content")}><Icon name="plus"/>Inhalt erstellen</button>}</div><div className="content-grid">{data.content.map((item) => <article className="content-card" key={item.id}><div className={`content-preview type-${item.content_type}`}><span>{item.content_type.toUpperCase()}</span></div><div><Status value={item.status}/><h3>{item.title}</h3><p>{item.payload?.text || "Noch keine Beschreibung"}</p><small>Geändert {new Date(item.updated_at).toLocaleDateString("de-CH")}</small></div></article>)}{!data.content.length && <Empty>Erstellen Sie Ihren ersten Inhalt.</Empty>}</div></section>}
      {view === "campaigns" && <section className="view"><div className="section-title"><div><h2>Kampagnen</h2><p>Inhalte zeitlich planen und gezielt ausspielen.</p></div>{canEdit && <button className="primary compact" onClick={() => setDialog("campaign")}><Icon name="plus"/>Kampagne planen</button>}</div><div className="table-card"><div className="table-head"><span>Name</span><span>Zeitraum</span><span>Status</span></div>{data.campaigns.map((item) => <div className="table-row" key={item.id}><strong>{item.name}</strong><span>{item.starts_at ? new Date(item.starts_at).toLocaleDateString("de-CH") : "Offen"} – {item.ends_at ? new Date(item.ends_at).toLocaleDateString("de-CH") : "Offen"}</span><Status value={item.status}/></div>)}{!data.campaigns.length && <Empty>Planen Sie Ihre erste Kampagne.</Empty>}</div></section>}
      {view === "displays" && <section className="view"><div className="section-title"><div><h2>Display-Netzwerk</h2><p>Status und Standorte aller verbundenen Flächen.</p></div></div><div className="display-grid">{data.displays.map((item) => <article className="display-card" key={item.id}><div className={`screen ${item.orientation === "portrait" ? "portrait" : ""}`}><div>Swiss<span>Compact</span></div></div><div><Status value={item.status}/><h3>{item.name}</h3><p>{item.site?.name || "Standort noch nicht zugewiesen"}</p><small>{item.resolution?.width ? `${item.resolution.width} × ${item.resolution.height}` : "Auflösung nicht erfasst"}</small></div></article>)}{!data.displays.length && <Empty>Displays werden durch SwissCompact eingerichtet und erscheinen danach hier.</Empty>}</div></section>}
      {view === "settings" && <section className="view"><div className="section-title"><div><h2>Konto & Service</h2><p>Ihr Portalzugang und das aktive SwissCompact-Paket.</p></div></div><div className="settings-grid"><article className="card plan"><span>Aktives Paket</span><h3>{data.subscription?.package_code || "Noch nicht zugewiesen"}</h3><Status value={data.subscription?.status || "paused"}/><p>Software, Portal, Wartung, Fehlerbehebung und kleinere Anpassungen – zentral betreut durch SwissCompact.</p>{data.subscription?.minimum_ends_on && <small>Mindestlaufzeit bis {new Date(data.subscription.minimum_ends_on).toLocaleDateString("de-CH")}</small>}</article><article className="card"><span>Portalzugänge</span><h3>{data.members.length} Benutzer</h3>{data.members.map((member) => <div className="row" key={member.id}><strong>{member.display_name || "Portalbenutzer"}</strong><span>{labels[member.role] || member.role}</span></div>)}</article><article className="card support"><span>SwissCompact Support</span><h3>Wir sind für Sie da.</h3><p>Für technische Fragen, neue Displays oder Unterstützung bei Ihren Inhalten.</p><a href="mailto:kontakt@swisscompact.com">kontakt@swisscompact.com</a></article></div></section>}
    </main>
    {dialog && <CreateDialog type={dialog} onClose={() => setDialog(null)} onCreated={() => { setDialog(null); void load(); }} />}
  </div>;
}

function CreateDialog({ type, onClose, onCreated }: { type: "content" | "campaign"; onClose: () => void; onCreated: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    const body = type === "content" ? { action: "create_content", title: form.get("title"), contentType: form.get("contentType"), text: form.get("text") } : { action: "create_campaign", name: form.get("title"), startsAt: form.get("startsAt") || null, endsAt: form.get("endsAt") || null };
    try { await api("/api/dashboard/records?audience=portal", { method: "POST", body: JSON.stringify(body) }); onCreated(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Speichern fehlgeschlagen"); } finally { setBusy(false); }
  }
  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="dialog" role="dialog" aria-modal="true"><button className="dialog-close" onClick={onClose} aria-label="Schließen">×</button><div className="eyebrow">{type === "content" ? "Content-Bibliothek" : "Kampagnenplanung"}</div><h2>{type === "content" ? "Neuen Inhalt erstellen" : "Neue Kampagne planen"}</h2><form onSubmit={submit}><label>{type === "content" ? "Titel" : "Kampagnenname"}<input name="title" required autoFocus /></label>{type === "content" ? <><label>Inhaltstyp<select name="contentType"><option value="composition">Komposition</option><option value="text">Text</option><option value="image">Bild</option><option value="video">Video</option><option value="web">Web-Inhalt</option></select></label><label>Text oder Beschreibung<textarea name="text" rows={5}/></label></> : <div className="date-pair"><label>Start<input name="startsAt" type="datetime-local" /></label><label>Ende<input name="endsAt" type="datetime-local" /></label></div>}{error && <div className="form-error">{error}</div>}<button className="primary" disabled={busy}>{busy ? "Wird gespeichert …" : "Als Entwurf speichern"}</button></form></section></div>;
}

createRoot(document.getElementById("portal-root")!).render(<Portal />);
