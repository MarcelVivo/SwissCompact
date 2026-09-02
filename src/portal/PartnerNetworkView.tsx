import { FormEvent, useMemo, useState } from "react";

type SettlementMode = "barter" | "paid" | "hybrid" | "courtesy";
type DeliveryStatus = "proposed" | "planned" | "host_confirmed" | "confirmed" | "disputed" | "cancelled";

type Partnership = {
  id: string;
  partner_tenant_id: string;
  partner_name: string;
  requested_by_tenant_id: string;
  direction: "incoming" | "outgoing";
  invitation_email: string;
  message?: string | null;
  status: "pending" | "active" | "declined" | "revoked";
  barter_credit_limit_points: number;
  balance_points: number;
  confirmed_balance_points: number;
  created_at: string;
};

type PartnerOffer = {
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
  settlement_mode: SettlementMode;
  requested_display_count: number;
  playlist_share_percent: number;
  delivery_value_points: number;
  barter_value_points: number;
  cash_amount_chf: number;
  cash_status: "not_applicable" | "agreed" | "received" | "cancelled";
  delivery_status: DeliveryStatus;
  created_at: string;
};

export type PartnerNetworkData = {
  available: boolean;
  partnerships: Partnership[];
  offers: PartnerOffer[];
};

type ShareableContent = { id: string; title: string; content_type: string; status: string; payload?: Record<string, any> };

const settlementLabels: Record<SettlementMode, string> = {
  barter: "Fairer Werbetausch",
  paid: "Bezahlte Werbung",
  hybrid: "Tausch + CHF-Ausgleich",
  courtesy: "Kostenlose Unterstützung",
};

const deliveryLabels: Record<DeliveryStatus, string> = {
  proposed: "Zur Prüfung",
  planned: "Angenommen und einzuplanen",
  host_confirmed: "Vom Bildschirmbesitzer als erfüllt gemeldet",
  confirmed: "Von beiden Betrieben bestätigt",
  disputed: "Rückfrage offen",
  cancelled: "Beendet",
};

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
  return value ? new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)) : "nicht festgelegt";
}

function pointsLabel(value: number): string {
  return `${new Intl.NumberFormat("de-CH", { maximumFractionDigits: 2 }).format(Number(value || 0))} Punkte`;
}

function cashLabel(value: number): string {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(Number(value || 0));
}

function Balance({ partnership }: { partnership: Partnership }) {
  const balance = Number(partnership.balance_points || 0);
  return <div className={`partner-balance ${balance > 0 ? "credit" : balance < 0 ? "debt" : "even"}`}>
    <span>Vereinbarter Tauschsaldo</span>
    <strong>{balance > 0 ? "+" : ""}{pointsLabel(balance)}</strong>
    <small>{balance > 0 ? "Sie haben mehr Werbeleistung erbracht." : balance < 0 ? "Ihr Partner hat mehr Werbeleistung erbracht." : "Der Tausch ist ausgeglichen."}</small>
    <em>Davon beidseitig bestätigt: {pointsLabel(partnership.confirmed_balance_points)} · Kreditlimit: {pointsLabel(partnership.barter_credit_limit_points)}</em>
  </div>;
}

function OfferTerms({ offer }: { offer: PartnerOffer }) {
  return <div className="partner-offer-terms">
    <div><span>Modell</span><strong>{settlementLabels[offer.settlement_mode]}</strong></div>
    <div><span>Ausspielung</span><strong>{offer.requested_display_count} Bildschirm{offer.requested_display_count === 1 ? "" : "e"} · {offer.playlist_share_percent}% Anteil</strong></div>
    <div><span>Werbewert</span><strong>{pointsLabel(offer.delivery_value_points)}</strong></div>
    {offer.barter_value_points > 0 && <div><span>Tauschausgleich</span><strong>{pointsLabel(offer.barter_value_points)}</strong></div>}
    {offer.cash_amount_chf > 0 && <div><span>Vereinbarter Betrag</span><strong>{cashLabel(offer.cash_amount_chf)}</strong></div>}
    <div><span>Zeitraum</span><strong>{displayDate(offer.proposed_starts_at)} – {displayDate(offer.proposed_ends_at)}</strong></div>
  </div>;
}

export function PartnerNetworkView({
  network,
  content,
  role,
  onChanged,
  onUseContent,
  onOpenContent,
}: {
  network: PartnerNetworkData;
  content: ShareableContent[];
  role: "owner" | "admin" | "editor" | "viewer";
  onChanged: () => Promise<void>;
  onUseContent: (contentId: string) => void;
  onOpenContent: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settlementMode, setSettlementMode] = useState<SettlementMode>("barter");
  const [offerDisplays, setOfferDisplays] = useState(1);
  const [offerShare, setOfferShare] = useState(10);
  const [offerStartsAt, setOfferStartsAt] = useState("");
  const [offerEndsAt, setOfferEndsAt] = useState("");
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
  const offerValue = useMemo(() => {
    const start = new Date(offerStartsAt);
    const end = new Date(offerEndsAt);
    if (!offerStartsAt || !offerEndsAt || end <= start) return null;
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
    return { days, points: Math.round(offerDisplays * days * offerShare / 10 * 100) / 100 };
  }, [offerDisplays, offerEndsAt, offerShare, offerStartsAt]);

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
    const saved = await run("invite", {
      action: "invite_partner",
      email: fields.get("email"),
      message: fields.get("message"),
      barterCreditLimitPoints: fields.get("barterCreditLimitPoints"),
    }, "Die Partnereinladung mit Fairnessregel wurde gesendet.");
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
      settlementMode: fields.get("settlementMode"),
      requestedDisplayCount: fields.get("requestedDisplayCount"),
      playlistSharePercent: fields.get("playlistSharePercent"),
      barterPercentage: fields.get("barterPercentage"),
      cashAmountChf: fields.get("cashAmountChf"),
      startsAt: fields.get("startsAt"),
      endsAt: fields.get("endsAt"),
      message: fields.get("message"),
    }, "Der Partnerbetrieb kann die klar bezifferte Vereinbarung jetzt prüfen.");
    if (saved) {
      form.reset();
      setSettlementMode("barter");
      setOfferDisplays(1);
      setOfferShare(10);
      setOfferStartsAt("");
      setOfferEndsAt("");
    }
  }

  if (!network.available) return <section className="view partner-view"><div className="section-title"><div><span className="partner-optional">Optionale Zusatzfunktion</span><h2>Partnernetzwerk</h2><p>Lokale Werbung fair tauschen oder bezahlt vereinbaren.</p></div></div><div className="partner-unavailable"><strong>Das Partnernetzwerk ist momentan nicht verfügbar.</strong><p>Ihre bestehenden Inhalte und Kampagnen bleiben davon unberührt. Bei Interesse unterstützt Sie SwissCompact persönlich.</p><a className="primary" href="mailto:kontakt@swisscompact.com?subject=Partnernetzwerk%20SwissCompact">Interesse melden</a></div></section>;

  return <section className="view partner-view">
    <div className="section-title"><div><span className="partner-optional">Optionale Zusatzfunktion</span><h2>Partnernetzwerk</h2><p>Lokale Reichweite fair tauschen, bezahlt vereinbaren oder bewusst kostenlos unterstützen.</p></div></div>
    <div className="partner-point-rule"><b>Die einfache Fairnessregel</b><strong>1 Werbepunkt = 1 Bildschirmtag mit 10% Playlist-Anteil</strong><span>Darum sind 1 Bildschirm zu 100% und 10 Bildschirme zu 10% gleich viel wert.</span></div>
    <div className="partner-principle"><b>Immer unter Ihrer Kontrolle</b><span>1. Partner verbinden</span><span>2. Leistung vereinbaren</span><span>3. Inhalt prüfen</span><span>4. Beide bestätigen</span></div>
    {error && <div className="partner-message error" role="alert">{error}</div>}
    {notice && <div className="partner-message success">✓ {notice}</div>}

    {incomingInvitations.length > 0 && <section className="partner-section"><div className="partner-heading"><div><span>Ihre Entscheidung</span><h3>Offene Einladungen</h3></div><b>{incomingInvitations.length}</b></div>{incomingInvitations.map((item) => <article className="partner-request" key={item.id}><div><strong>{item.partner_name}</strong><p>{item.message || "Möchte lokale Werbung mit Ihnen austauschen."}</p><small>Vorgeschlagenes Kreditlimit: {pointsLabel(item.barter_credit_limit_points)}. Die Verbindung veröffentlicht noch nichts.</small></div>{canManage && <div className="partner-actions"><button className="partner-confirm" disabled={Boolean(busy)} onClick={() => void run(`accept-${item.id}`, { action: "respond_partner_invitation", id: item.id, decision: "accept" }, `${item.partner_name} ist jetzt Ihr Partner.`)}>Regel annehmen</button><button disabled={Boolean(busy)} onClick={() => void run(`decline-${item.id}`, { action: "respond_partner_invitation", id: item.id, decision: "decline" }, "Einladung abgelehnt.")}>Ablehnen</button></div>}</article>)}</section>}

    <div className="partner-columns">
      <section className="partner-section"><div className="partner-heading"><div><span>Schritt 1</span><h3>Partner verbinden</h3></div><b>{active.length}</b></div>{canManage && <form className="partner-form" onSubmit={invite}><label>Portal-E-Mail des Partnerbetriebs<input type="email" name="email" placeholder="z. B. cafe@beispiel.ch" required/></label><label>Maximaler offener Tauschkredit<select name="barterCreditLimitPoints" defaultValue="300"><option value="100">100 Punkte · vorsichtig</option><option value="300">300 Punkte · empfohlen</option><option value="1000">1'000 Punkte · grosses Netzwerk</option></select></label><small>Erreicht ein Betrieb das Minuslimit, muss zuerst Gegenwerbung oder ein CHF-Ausgleich vereinbart werden.</small><label>Kurze Nachricht (optional)<textarea name="message" rows={3} placeholder="Gerne würden wir lokale Werbung fair austauschen."/></label><button className="partner-confirm" disabled={Boolean(busy)}>{busy === "invite" ? "Wird geprüft …" : "Partner einladen"}</button></form>}{active.map((item) => <article className="partner-connection" key={item.id}><div><span>Verbunden</span><strong>{item.partner_name}</strong><small>Werbung wird immer einzeln geprüft.</small></div><Balance partnership={item}/>{canManage && <button disabled={Boolean(busy)} onClick={() => void run(`revoke-${item.id}`, { action: "revoke_partnership", id: item.id }, "Partnerschaft beendet.")}>Verbindung beenden</button>}</article>)}{outgoingInvitations.map((item) => <article className="partner-connection pending" key={item.id}><div><span>Einladung offen</span><strong>{item.partner_name}</strong><small>Vorgeschlagenes Kreditlimit: {pointsLabel(item.barter_credit_limit_points)}</small></div></article>)}{!active.length && !outgoingInvitations.length && <p className="partner-empty">Noch kein Partner verbunden.</p>}</section>

      <section className="partner-section">
        <div className="partner-heading"><div><span>Schritt 2</span><h3>Klare Vereinbarung senden</h3></div></div>
        {canOffer && active.length > 0 && shareable.length > 0 ? <form className="partner-form" onSubmit={offer}>
          <label>Partner<select name="partnershipId" required defaultValue=""><option value="" disabled>Partner auswählen</option>{active.map((item) => <option key={item.id} value={item.id}>{item.partner_name}</option>)}</select></label>
          <label>Freigegebener Inhalt<select name="contentId" required defaultValue=""><option value="" disabled>Bild oder Video auswählen</option>{shareable.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <label>Art der Vereinbarung<select name="settlementMode" value={settlementMode} onChange={(event) => setSettlementMode(event.target.value as SettlementMode)}><option value="barter">Fairer Werbetausch</option><option value="paid">Bezahlte Werbung</option><option value="hybrid">Tausch + CHF-Ausgleich</option><option value="courtesy">Kostenlose Unterstützung</option></select></label>
          <div className="partner-dates">
            <label>Anzahl Bildschirme<input type="number" name="requestedDisplayCount" min="1" max="10000" value={offerDisplays} onChange={(event) => setOfferDisplays(Math.max(1, Number(event.target.value) || 1))} required/></label>
            <label>Anteil an der Playlist<select name="playlistSharePercent" value={offerShare} onChange={(event) => setOfferShare(Number(event.target.value))}><option value="5">5%</option><option value="10">10%</option><option value="25">25%</option><option value="50">50%</option><option value="100">100%</option></select></label>
          </div>
          <div className="partner-dates">
            <label>Start<input type="datetime-local" name="startsAt" value={offerStartsAt} onChange={(event) => setOfferStartsAt(event.target.value)} required/></label>
            <label>Ende<input type="datetime-local" name="endsAt" value={offerEndsAt} onChange={(event) => setOfferEndsAt(event.target.value)} required/></label>
          </div>
          {offerValue && <div className="partner-value-preview"><span>Berechneter Werbewert</span><strong>{pointsLabel(offerValue.points)}</strong><small>{offerDisplays} × {offerValue.days} Tag{offerValue.days === 1 ? "" : "e"} × {offerShare}% ÷ 10</small></div>}
          {settlementMode === "hybrid" && <label>Anteil als Werbetausch<select name="barterPercentage" defaultValue="50"><option value="25">25% Tauschpunkte</option><option value="50">50% Tauschpunkte</option><option value="75">75% Tauschpunkte</option></select></label>}
          {["paid", "hybrid"].includes(settlementMode) && <label>Extern vereinbarter Betrag in CHF<input type="number" name="cashAmountChf" min="0.01" step="0.01" placeholder="z. B. 250.00" required/></label>}
          <label>Hinweis (optional)<textarea name="message" rows={3} placeholder="Zum Beispiel: Bitte während der Mittagszeit anzeigen."/></label>
          <small>CHF-Beträge werden nur dokumentiert. Rechnung und Zahlung erfolgen direkt zwischen den Betrieben.</small>
          <button className="partner-confirm" disabled={Boolean(busy)}>{busy === "offer" ? "Wird angeboten …" : "Vereinbarung zur Prüfung senden"}</button>
        </form> : <div className="partner-empty">{!active.length ? "Verbinden Sie zuerst links einen Partnerbetrieb." : !shareable.length ? <><span>Für eine Vereinbarung benötigen Sie ein freigegebenes Bild oder Video.</span>{canOffer && <button type="button" className="secondary" onClick={onOpenContent}>Zu Medien &amp; Vorlagen</button>}</> : "Nur mit Bearbeitungsrecht verfügbar."}</div>}
      </section>
    </div>

    <section className="partner-section"><div className="partner-heading"><div><span>Schritt 3</span><h3>Eingegangene Vereinbarungen</h3></div><b>{incomingOffers.filter((item) => item.status === "pending").length}</b></div><div className="partner-offer-grid">{incomingOffers.map((item) => <article className={`partner-offer status-${item.status}`} key={item.id}><span>{item.sender_name}</span><h4>{item.title_snapshot}</h4><OfferTerms offer={item}/><p>{item.message || "Kein zusätzlicher Hinweis."}</p>{item.status === "pending" && canManage && <div className="partner-actions"><button className="partner-confirm" disabled={Boolean(busy)} onClick={() => void run(`offer-accept-${item.id}`, { action: "respond_partner_offer", id: item.id, decision: "accept" }, "Vereinbarung angenommen. Planen Sie den Inhalt jetzt auf den vereinbarten Bildschirmen ein.")}>Vereinbarung annehmen</button><button disabled={Boolean(busy)} onClick={() => void run(`offer-decline-${item.id}`, { action: "respond_partner_offer", id: item.id, decision: "decline" }, "Vereinbarung abgelehnt.")}>Ablehnen</button></div>}{item.status === "accepted" && item.recipient_content_id && <button className="partner-use" onClick={() => onUseContent(item.recipient_content_id!)}>Bildschirme &amp; Zeit einplanen</button>}{item.status === "accepted" && canManage && ["planned", "disputed"].includes(item.delivery_status) && <button onClick={() => void run(`host-${item.id}`, { action: "update_partner_delivery", id: item.id, decision: "host_confirm" }, "Ausspielung gemeldet. Der Werbepartner kann sie jetzt bestätigen.")}>Ausspielung als erfüllt melden</button>}{item.status === "accepted" && canManage && item.cash_status === "agreed" && <button onClick={() => void run(`cash-${item.id}`, { action: "update_partner_delivery", id: item.id, decision: "cash_received" }, "Der externe Zahlungseingang wurde dokumentiert.")}>Externen CHF-Eingang bestätigen</button>}<b className="partner-state">{item.status === "accepted" ? deliveryLabels[item.delivery_status] : item.status === "pending" ? "Offen" : item.status === "declined" ? "Abgelehnt" : "Beendet"}</b></article>)}{!incomingOffers.length && <p className="partner-empty">Noch keine Werbung von Partnern erhalten.</p>}</div></section>

    {outgoingOffers.length > 0 && <section className="partner-section"><div className="partner-heading"><div><span>Schritt 4</span><h3>Gesendete Vereinbarungen bestätigen</h3></div></div><div className="partner-offer-grid">{outgoingOffers.map((item) => <article className={`partner-offer status-${item.status}`} key={item.id}><span>An {item.recipient_name}</span><h4>{item.title_snapshot}</h4><OfferTerms offer={item}/>{item.status === "pending" && <button disabled={Boolean(busy)} onClick={() => void run(`withdraw-${item.id}`, { action: "withdraw_partner_offer", id: item.id }, "Angebot zurückgezogen.")}>Zurückziehen</button>}{item.status === "accepted" && item.delivery_status === "host_confirmed" && canManage && <div className="partner-actions"><button className="partner-confirm" disabled={Boolean(busy)} onClick={() => void run(`confirm-${item.id}`, { action: "update_partner_delivery", id: item.id, decision: "advertiser_confirm" }, "Die Werbeleistung wurde beidseitig bestätigt.")}>Ausspielung bestätigen</button><button disabled={Boolean(busy)} onClick={() => void run(`dispute-${item.id}`, { action: "update_partner_delivery", id: item.id, decision: "dispute" }, "Rückfrage wurde markiert.")}>Rückfrage melden</button></div>}<b className="partner-state">{item.status === "accepted" ? deliveryLabels[item.delivery_status] : item.status === "pending" ? "Wartet auf Prüfung" : item.status === "declined" ? "Abgelehnt" : "Beendet"}</b></article>)}</div></section>}
  </section>;
}
