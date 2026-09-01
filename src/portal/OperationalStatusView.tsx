import { useMemo, useState } from "react";

type StatusDisplay = {
  id: string;
  name: string;
  status: string;
  delivery_status?: string;
  configuration_version?: number;
  last_acknowledged_version?: number | null;
  last_seen_at?: string | null;
  last_delivery_at?: string | null;
  last_delivery_error?: string | null;
  fallback_content_id?: string | null;
  site?: { name?: string };
};

type StatusContent = {
  id: string;
  title: string;
  content_type: string;
  status: string;
  payload?: { uploadState?: string; processingState?: string; processingError?: string };
};

type StatusCampaign = {
  id: string;
  name: string;
  status: string;
  display_links?: Array<{ display_id: string }>;
  content_links?: Array<{ content: { id: string } | null }>;
  target_assignments?: Array<{ display_id: string; content_links: Array<{ content: { id: string } | null }> }>;
};

type StatusAlert = {
  id: string;
  display_id: string;
  kind: string;
  severity: string;
  status: string;
  message: string;
  first_seen_at?: string;
  last_seen_at: string;
};

type StatusIssue = {
  id: string;
  tone: "critical" | "warning";
  area: "Bildschirm" | "Medium" | "Kampagne";
  title: string;
  detail: string;
  time?: string | null;
  destination: "displays" | "content" | "campaigns";
  alert?: StatusAlert;
  acknowledged?: boolean;
};

export type OperationalStatusData = {
  displays: StatusDisplay[];
  content: StatusContent[];
  campaigns: StatusCampaign[];
  alerts: StatusAlert[];
  generatedAt?: string;
};

const alertTitles: Record<string, string> = {
  offline: "Bildschirm ohne Verbindung",
  delivery_error: "Inhalt konnte nicht ausgeliefert werden",
  cache_error: "Offline-Sicherung konnte nicht aktualisiert werden",
  campaign_conflict: "Zwei Kampagnen überschneiden sich",
};

function dateTime(value?: string | null): string {
  if (!value) return "Noch keine Rückmeldung";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Zeitpunkt unbekannt" : date.toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" });
}

function campaignIsComplete(campaign: StatusCampaign): boolean {
  const displays = campaign.display_links || [];
  if (!displays.length) return false;
  const sharedContent = (campaign.content_links || []).some((link) => Boolean(link.content?.id));
  if (sharedContent) return true;
  return displays.every((display) => (campaign.target_assignments || []).some((assignment) => assignment.display_id === display.display_id && assignment.content_links.some((link) => Boolean(link.content?.id))));
}

function buildIssues(data: OperationalStatusData): StatusIssue[] {
  const displayById = new Map(data.displays.map((display) => [display.id, display]));
  const alertedDisplays = new Set(data.alerts.map((alert) => `${alert.display_id}:${alert.kind}`));
  const issues: StatusIssue[] = data.alerts.map((alert) => {
    const display = displayById.get(alert.display_id);
    return {
      id: `alert:${alert.id}`,
      tone: alert.severity === "error" ? "critical" : "warning",
      area: "Bildschirm",
      title: `${alertTitles[alert.kind] || "Bildschirm prüfen"}${display ? ` · ${display.name}` : ""}`,
      detail: alert.message,
      time: alert.last_seen_at,
      destination: "displays",
      alert,
      acknowledged: alert.status === "acknowledged",
    };
  });

  for (const display of data.displays) {
    if (display.status === "offline" && !alertedDisplays.has(`${display.id}:offline`)) {
      issues.push({ id: `offline:${display.id}`, tone: "warning", area: "Bildschirm", title: `Bildschirm ohne Verbindung · ${display.name}`, detail: "Der Player meldet sich momentan nicht. Prüfen Sie Strom, Netzwerk und den geöffneten Player.", time: display.last_seen_at, destination: "displays" });
    }
    if (display.delivery_status === "error" && !alertedDisplays.has(`${display.id}:delivery_error`)) {
      issues.push({ id: `delivery:${display.id}`, tone: "critical", area: "Bildschirm", title: `Auslieferung fehlgeschlagen · ${display.name}`, detail: display.last_delivery_error || "Die aktuelle Bildschirmkonfiguration konnte nicht bestätigt werden.", time: display.last_delivery_at, destination: "displays" });
    }
    if (!["provisioning", "retired"].includes(display.status) && display.delivery_status === "pending" && Number(display.configuration_version || 0) > Number(display.last_acknowledged_version || 0)) {
      issues.push({ id: `pending:${display.id}`, tone: "warning", area: "Bildschirm", title: `Neue Inhalte noch nicht bestätigt · ${display.name}`, detail: "Der Player hat die aktuelle Konfiguration noch nicht bestätigt. Aktualisieren Sie den Status in Kürze erneut.", time: display.last_delivery_at, destination: "displays" });
    }
  }

  const withoutFallback = data.displays.filter((display) => !["provisioning", "retired"].includes(display.status) && !display.fallback_content_id);
  if (withoutFallback.length) {
    issues.push({ id: "fallback:missing", tone: "warning", area: "Bildschirm", title: "Offline-Ersatzinhalt fehlt", detail: `${withoutFallback.length} ${withoutFallback.length === 1 ? "Bildschirm zeigt" : "Bildschirme zeigen"} bei einem Verbindungsunterbruch noch keinen festgelegten Ersatzinhalt.`, destination: "displays" });
  }

  for (const content of data.content) {
    if (content.payload?.processingState === "error") {
      issues.push({ id: `content:${content.id}`, tone: "critical", area: "Medium", title: `Video nicht verfügbar · ${content.title}`, detail: content.payload.processingError || "Die technische Aufbereitung ist fehlgeschlagen. Laden Sie das Video erneut hoch.", destination: "content" });
    }
  }

  for (const campaign of data.campaigns) {
    if (["active", "scheduled"].includes(campaign.status) && !campaignIsComplete(campaign)) {
      issues.push({ id: `campaign:${campaign.id}`, tone: "critical", area: "Kampagne", title: `Unvollständige Ausspielung · ${campaign.name}`, detail: "Mindestens einem Zielbildschirm fehlt ein Inhalt. Pausieren und vervollständigen Sie die Kampagne.", destination: "campaigns" });
    }
  }

  return issues.sort((left, right) => ({ critical: 0, warning: 1 })[left.tone] - ({ critical: 0, warning: 1 })[right.tone]);
}

export function OperationalStatusView({ data, canEdit, onRefresh, onNavigate, onAcknowledge }: {
  data: OperationalStatusData;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
  onNavigate: (destination: "displays" | "content" | "campaigns") => void;
  onAcknowledge: (alertId: string) => Promise<void>;
}) {
  const issues = useMemo(() => buildIssues(data), [data]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const openIssues = issues;
  const critical = openIssues.filter((issue) => issue.tone === "critical").length;
  const warnings = openIssues.filter((issue) => issue.tone === "warning").length;
  const online = data.displays.filter((display) => display.status === "online").length;
  const delivered = data.displays.filter((display) => display.delivery_status === "delivered").length;
  const readyMedia = data.content.filter((content) => ["approved", "published"].includes(content.status) && (!["image", "video"].includes(content.content_type) || (content.payload?.uploadState === "ready" && (!content.payload.processingState || content.payload.processingState === "ready")))).length;
  const withoutFallback = data.displays.filter((display) => !["provisioning", "retired"].includes(display.status) && !display.fallback_content_id).length;
  const overall = critical > 0 ? "critical" : warnings > 0 ? "warning" : "healthy";

  async function acknowledge(alertId: string) {
    setBusy(alertId); setError("");
    try { await onAcknowledge(alertId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Die Warnung konnte nicht bestätigt werden."); }
    finally { setBusy(""); }
  }

  async function refresh() {
    setBusy("refresh"); setError("");
    try { await onRefresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Der Systemstatus konnte nicht aktualisiert werden."); }
    finally { setBusy(""); }
  }

  return <section className="view operational-status-view">
    <div className="section-title operational-title"><div><span className="eyebrow">Betrieb & Sicherheit</span><h2>Systemstatus</h2><p>Sie sehen sofort, ob Ihre Bildschirme und Inhalte funktionieren – und was bei einer Störung zu tun ist.</p></div><button type="button" className="secondary operational-refresh" disabled={Boolean(busy)} onClick={() => void refresh()}>{busy === "refresh" ? "Wird geprüft …" : "Status aktualisieren"}</button></div>

    <section className={`operational-summary ${overall}`}>
      <div className="operational-summary-mark">{overall === "healthy" ? "✓" : overall === "warning" ? "!" : "×"}</div>
      <div><span>{overall === "healthy" ? "Alles läuft" : overall === "warning" ? "Bitte prüfen" : "Handlungsbedarf"}</span><h3>{overall === "healthy" ? "Ihre Ausspielung ist betriebsbereit." : critical > 0 ? `${critical} ${critical === 1 ? "Störung benötigt" : "Störungen benötigen"} Ihre Aufmerksamkeit.` : `${warnings} ${warnings === 1 ? "Hinweis sollte" : "Hinweise sollten"} geprüft werden.`}</h3><p>{overall === "healthy" ? "Zurzeit liegen keine offenen technischen Warnungen vor." : "Öffnen Sie die Meldungen unten. Jede Meldung führt direkt zum betroffenen Bereich."}</p></div>
      <small>Geprüft: {dateTime(data.generatedAt)}</small>
    </section>

    <div className="operational-metrics">
      <article><span>Verbindung</span><strong>{online}/{data.displays.length}</strong><small>Bildschirme online</small></article>
      <article><span>Auslieferung</span><strong>{delivered}/{data.displays.length}</strong><small>Konfiguration bestätigt</small></article>
      <article><span>Medien</span><strong>{readyMedia}</strong><small>displaybereit und freigegeben</small></article>
      <article className={openIssues.length ? "needs-attention" : ""}><span>Offene Hinweise</span><strong>{openIssues.length}</strong><small>{critical} kritisch · {warnings} prüfen</small></article>
    </div>

    {error && <div className="form-error" role="alert">{error}</div>}

    <div className="operational-layout">
      <section className="operational-issues">
        <header><div><span>Was jetzt zu tun ist</span><h3>{openIssues.length ? "Offene Meldungen" : "Keine offenen Meldungen"}</h3></div><b>{openIssues.length}</b></header>
        {openIssues.map((issue) => <article className={issue.tone} key={issue.id}>
          <i>{issue.tone === "critical" ? "×" : "!"}</i>
          <div><span>{issue.area}</span><strong>{issue.title}</strong><p>{issue.detail}</p>{issue.time && <small>Zuletzt festgestellt: {dateTime(issue.time)}</small>}{issue.acknowledged && <small className="operational-acknowledged">✓ Gesehen – die Meldung bleibt bis zur Behebung sichtbar</small>}</div>
          <div className="operational-issue-actions"><button type="button" className="secondary" onClick={() => onNavigate(issue.destination)}>Bereich öffnen</button>{canEdit && issue.alert?.status === "open" && <button type="button" className="operational-seen" disabled={busy === issue.alert.id} onClick={() => void acknowledge(issue.alert!.id)}>{busy === issue.alert.id ? "Wird gespeichert …" : "Gesehen"}</button>}</div>
        </article>)}
        {!openIssues.length && <div className="operational-empty"><b>✓</b><strong>Keine Handlung erforderlich</strong><span>SwissCompact überwacht weiterhin Verbindung, Auslieferung und Medienaufbereitung.</span></div>}
      </section>

      <aside className="operational-checks">
        <header><span>Automatische Prüfungen</span><h3>Was SwissCompact überwacht</h3></header>
        <article className={online === data.displays.length ? "healthy" : "warning"}><i></i><div><strong>Player-Verbindung</strong><span>{data.displays.length ? `${online} von ${data.displays.length} online` : "Noch keine Bildschirme eingerichtet"}</span></div></article>
        <article className={delivered === data.displays.length ? "healthy" : "warning"}><i></i><div><strong>Inhaltsauslieferung</strong><span>{data.displays.length ? `${delivered} von ${data.displays.length} bestätigt` : "Noch keine Auslieferung"}</span></div></article>
        <article className={data.content.some((content) => content.payload?.processingState === "error") ? "critical" : "healthy"}><i></i><div><strong>Medienaufbereitung</strong><span>{data.content.some((content) => content.payload?.processingState === "error") ? "Fehler gefunden" : "Keine Verarbeitungsfehler"}</span></div></article>
        <article className={withoutFallback ? "warning" : "healthy"}><i></i><div><strong>Offline-Ersatzinhalt</strong><span>{withoutFallback ? `${withoutFallback} ${withoutFallback === 1 ? "Bildschirm ist" : "Bildschirme sind"} noch ungeschützt` : "Für alle aktiven Bildschirme festgelegt"}</span></div></article>
        {withoutFallback > 0 && <button type="button" className="secondary" onClick={() => onNavigate("displays")}>Ersatzinhalt festlegen</button>}
      </aside>
    </div>
  </section>;
}

export function operationalOpenIssueCount(data: OperationalStatusData): number {
  return buildIssues(data).length;
}

export function operationalCriticalIssueCount(data: OperationalStatusData): number {
  return buildIssues(data).filter((issue) => issue.tone === "critical").length;
}
