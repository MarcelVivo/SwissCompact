import { FormEvent, useMemo, useState } from "react";

export type PartnerNetworkData = {
  available: boolean;
  partnerships: Array<{
    id: string;
    partner_tenant_id: string;
    partner_name: string;
    requested_by_tenant_id: string;
    direction: "incoming" | "outgoing";
    invitation_email: string;
    message?: string | null;
    status: "pending" | "active" | "declined" | "revoked";
    created_at: string;
  }>;
  offers: Array<{
    id: string;
    partnership_id: string;
    direction: "incoming" | "outgoing";
    sender_name: string;
    recipient_name: string;
    recipient_content_id?: string | null;
    title_snapshot: string;
    message?: string | null;
    proposed_starts_at?: string | null;
    proposed_ends_at?: string | null;
    status: "pending" | "accepted" | "declined" | "withdrawn" | "expired";
    created_at: string;
  }>;
};

type ShareableContent = { id: string; title: string; content_type: string; status: string; payload?: Record<string, any> };

async function partnerAction(body: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await fetch("/api/dashboard/records?audience=portal", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Die Partneraktion konnte nicht abgeschlossen werden.");
  return result;
}

function displayDate(value?: string | null): string {
  return value ? new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)) : "frei wählbar";
}

export function PartnerNetworkView({
  network,
  content,
  role,
  onChanged,
  onUseContent,
}: {
  network: PartnerNetworkData;
  content: ShareableContent[];
  role: "owner" | "admin" | "editor" | "viewer";
  onChanged: () => Promise<void>;
  onUseContent: (contentId: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = network.partnerships.filter((item) => item.status === "active");
  const incomingInvitations = network.partnerships.filter((item) => item.status === "pending" && item.direction === "incoming");
  const outgoingInvitations = network.partnerships.filter((item) => item.status === "pending" && item.direction === "outgoing");
  const incomingOffers = network.offers.filter((item) => item.direction === "incoming");
  const outgoingOffers = network.offers.filter((item) => item.direction === "outgoing");
  const canManage = role === "owner" || role === "admin";
  const canOffer = role !== "viewer";
  const shareable = useMemo(() => content.filter((item) => {
    const ready = item.payload?.uploadState === "ready" && (!item.payload?.processingState || item.payload.processingState === "ready");
    return ["image", "video"].includes(item.content_type) && ["approved", "published"].includes(item.status) && ready;
  }), [content]);

  async function run(key: string, body: Record<string, unknown>, success: string): Promise<boolean> {
    if (busy) return false;
    setBusy(key); setError(""); setNotice("");
    try {
      await partnerAction(body);
      setNotice(success);
      await onChanged();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Aktion fehlgeschlagen");
      return false;
    } finally { setBusy(""); }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const form = event.currentTarget;
    const saved = await run("invite", { action: "invite_partner", email: fields.get("email"), message: fields.get("message") }, "Die Partnereinladung wurde gesendet.");
    if (saved) form.reset();
  }

  async function offer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const form = event.currentTarget;
    const saved = await run("offer", {
      action: "create_partner_offer",
      partnershipId: fields.get("partnershipId"),
      contentId: fields.get("contentId"),
      message: fields.get("message"),
      startsAt: fields.get("startsAt"),
      endsAt: fields.get("endsAt"),
    }, "Der Partnerbetrieb kann Ihre Werbung jetzt prüfen.");
    if (saved) form.reset();
  }

  if (!network.available) return <section className="view partner-view"><div className="section-title"><div><h2>Partnerwerbung</h2><p>Gegenseitige Werbung zwischen befreundeten Betrieben.</p></div></div><div className="partner-unavailable"><strong>Das Partnerprogramm wird gerade eingerichtet.</strong><p>Nach der Datenbank-Aktivierung können Sie Partnerbetriebe verbinden und Werbung sicher austauschen.</p></div></section>;

  return <section className="view partner-view">
    <div className="section-title"><div><h2>Partnerwerbung</h2><p>Zum Beispiel Coiffeur ↔ Café: Inhalte anbieten, vom Partner bestätigen lassen und selbst auf den eigenen Bildschirmen einplanen.</p></div></div>
    <div className="partner-principle"><b>So bleibt es sicher</b><span>1. Partner verbinden</span><span>2. Werbung anbieten</span><span>3. Empfänger prüft</span><span>4. Empfänger wählt Bildschirm &amp; Zeit</span></div>
    {error && <div className="partner-message error" role="alert">{error}</div>}
    {notice && <div className="partner-message success">✓ {notice}</div>}

    {incomingInvitations.length > 0 && <section className="partner-section"><div className="partner-heading"><div><span>Ihre Entscheidung</span><h3>Offene Einladungen</h3></div><b>{incomingInvitations.length}</b></div>{incomingInvitations.map((item) => <article className="partner-request" key={item.id}><div><strong>{item.partner_name}</strong><p>{item.message || "Möchte Werbung mit Ihnen austauschen."}</p><small>Die Verbindung allein veröffentlicht noch keine Werbung.</small></div>{canManage && <div className="partner-actions"><button className="partner-confirm" disabled={Boolean(busy)} onClick={() => void run(`accept-${item.id}`, { action: "respond_partner_invitation", id: item.id, decision: "accept" }, `${item.partner_name} ist jetzt Ihr Partner.`)}>Annehmen</button><button disabled={Boolean(busy)} onClick={() => void run(`decline-${item.id}`, { action: "respond_partner_invitation", id: item.id, decision: "decline" }, "Einladung abgelehnt.")}>Ablehnen</button></div>}</article>)}</section>}

    <div className="partner-columns">
      <section className="partner-section"><div className="partner-heading"><div><span>Schritt 1</span><h3>Partner verbinden</h3></div><b>{active.length}</b></div>{canManage && <form className="partner-form" onSubmit={invite}><label>Portal-E-Mail des Partnerbetriebs<input type="email" name="email" placeholder="z. B. cafe@beispiel.ch" required/></label><label>Kurze Nachricht (optional)<textarea name="message" rows={3} placeholder="Gerne würden wir gegenseitig lokale Werbung zeigen."/></label><button className="partner-confirm" disabled={Boolean(busy)}>{busy === "invite" ? "Wird geprüft …" : "Partner einladen"}</button></form>}{active.map((item) => <article className="partner-connection" key={item.id}><div><span>Verbunden</span><strong>{item.partner_name}</strong><small>Werbung kann angeboten werden – nie direkt veröffentlicht.</small></div>{canManage && <button disabled={Boolean(busy)} onClick={() => void run(`revoke-${item.id}`, { action: "revoke_partnership", id: item.id }, "Partnerschaft beendet.")}>Verbindung beenden</button>}</article>)}{outgoingInvitations.map((item) => <article className="partner-connection pending" key={item.id}><div><span>Einladung offen</span><strong>{item.partner_name}</strong><small>Wartet auf Bestätigung des Partnerbetriebs.</small></div></article>)}{!active.length && !outgoingInvitations.length && <p className="partner-empty">Noch kein Partner verbunden.</p>}</section>

      <section className="partner-section"><div className="partner-heading"><div><span>Schritt 2</span><h3>Werbung anbieten</h3></div></div>{canOffer && active.length > 0 && shareable.length > 0 ? <form className="partner-form" onSubmit={offer}><label>Partner<select name="partnershipId" required defaultValue=""><option value="" disabled>Partner auswählen</option>{active.map((item) => <option key={item.id} value={item.id}>{item.partner_name}</option>)}</select></label><label>Freigegebener Inhalt<select name="contentId" required defaultValue=""><option value="" disabled>Bild oder Video auswählen</option>{shareable.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><div className="partner-dates"><label>Vorschlag Start<input type="datetime-local" name="startsAt"/></label><label>Vorschlag Ende<input type="datetime-local" name="endsAt"/></label></div><label>Hinweis (optional)<textarea name="message" rows={3} placeholder="Zum Beispiel: Bitte während der Mittagszeit anzeigen."/></label><button className="partner-confirm" disabled={Boolean(busy)}>{busy === "offer" ? "Wird angeboten …" : "Werbung zur Prüfung senden"}</button></form> : <div className="partner-empty">{!active.length ? "Verbinden Sie zuerst einen Partnerbetrieb." : !shareable.length ? "Geben Sie zuerst ein fertig aufbereitetes Bild oder Video frei." : "Nur mit Bearbeitungsrecht verfügbar."}</div>}</section>
    </div>

    <section className="partner-section"><div className="partner-heading"><div><span>Schritt 3</span><h3>Eingegangene Werbung prüfen</h3></div><b>{incomingOffers.filter((item) => item.status === "pending").length}</b></div><div className="partner-offer-grid">{incomingOffers.map((item) => <article className={`partner-offer status-${item.status}`} key={item.id}><span>{item.sender_name}</span><h4>{item.title_snapshot}</h4><p>{item.message || "Kein zusätzlicher Hinweis."}</p><small>Zeitraum-Vorschlag: {displayDate(item.proposed_starts_at)} bis {displayDate(item.proposed_ends_at)}</small>{item.status === "pending" && canManage && <div className="partner-actions"><button className="partner-confirm" disabled={Boolean(busy)} onClick={() => void run(`offer-accept-${item.id}`, { action: "respond_partner_offer", id: item.id, decision: "accept" }, "Werbung übernommen. Sie liegt jetzt freigegeben in Medien & Vorlagen.")}>In Mediathek übernehmen</button><button disabled={Boolean(busy)} onClick={() => void run(`offer-decline-${item.id}`, { action: "respond_partner_offer", id: item.id, decision: "decline" }, "Werbung abgelehnt.")}>Ablehnen</button></div>}{item.status === "accepted" && item.recipient_content_id && <button className="partner-use" onClick={() => onUseContent(item.recipient_content_id!)}>Jetzt Bildschirm &amp; Zeit wählen</button>}<b className="partner-state">{item.status === "pending" ? "Offen" : item.status === "accepted" ? "Übernommen" : item.status === "declined" ? "Abgelehnt" : "Beendet"}</b></article>)}{!incomingOffers.length && <p className="partner-empty">Noch keine Werbung von Partnern erhalten.</p>}</div></section>

    {outgoingOffers.length > 0 && <section className="partner-section"><div className="partner-heading"><div><span>Übersicht</span><h3>Gesendete Angebote</h3></div></div><div className="partner-offer-grid">{outgoingOffers.map((item) => <article className={`partner-offer status-${item.status}`} key={item.id}><span>An {item.recipient_name}</span><h4>{item.title_snapshot}</h4><small>{item.status === "pending" ? "Wartet auf Prüfung" : item.status === "accepted" ? "Vom Partner übernommen" : item.status === "declined" ? "Vom Partner abgelehnt" : "Beendet"}</small>{item.status === "pending" && <button disabled={Boolean(busy)} onClick={() => void run(`withdraw-${item.id}`, { action: "withdraw_partner_offer", id: item.id }, "Angebot zurückgezogen.")}>Zurückziehen</button>}</article>)}</div></section>}
  </section>;
}
