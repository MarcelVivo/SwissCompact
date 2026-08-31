import React, { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./quote.css";
import "./quote-decision.css";

type Quote = { quoteNumber: string; status: string; currency: string; total: number; validUntil: string; items: Array<{ description: string; quantity: number; unit: string; unitPriceChf: number; totalChf: number }>; terms: string; documentHash: string; acceptedByName?: string; acceptedAt?: string; companyName: string; contactName?: string; projectTitle?: string; pdfUrl?: string };
const money = (value: unknown) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(Number(value || 0));
const date = (value: unknown) => value ? new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(String(value))) : "–";
const token = location.pathname.startsWith("/offerte/") ? location.pathname.split("/").filter(Boolean).pop() || "" : new URLSearchParams(location.search).get("token") || "";

async function request(method = "GET", body?: unknown) {
  const response = await fetch(`/api/dashboard/records?public=quote&token=${encodeURIComponent(token)}`, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Die Offerte konnte nicht geladen werden.");
  return data;
}

function Mark() { return <div className="wordmark"><span>Swiss</span><b>Compact</b></div>; }

function App() {
  const [state, setState] = useState<{ loading?: boolean; quote?: Quote; error?: string; result?: any }>({ loading: true });
  const [busy, setBusy] = useState(false); const [formError, setFormError] = useState(""); const [declining, setDeclining] = useState(false);
  useEffect(() => { request().then(data => setState({ quote: data.quote })).catch(error => setState({ error: error.message })); }, []);
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFormError("");
    const form = new FormData(event.currentTarget);
    try { const result = await request("POST", { decision: "accept", name: form.get("name"), email: form.get("email"), confirm: form.get("confirm") === "on" }); setState(current => ({ ...current, result })); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (error) { setFormError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function decline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFormError("");
    const form = new FormData(event.currentTarget);
    try { const result = await request("POST", { decision: "decline", name: form.get("name"), email: form.get("email"), reason: form.get("reason"), confirm: form.get("confirm") === "on" }); setState(current => ({ ...current, result })); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (error) { setFormError((error as Error).message); }
    finally { setBusy(false); }
  }
  if (state.loading) return <main className="center"><Mark/><span className="loader"/><p>Gesicherte Offerte wird geladen …</p></main>;
  if (state.error) return <main className="center error"><Mark/><div className="status-icon">!</div><h1>Link nicht verfügbar</h1><p>{state.error}</p><a href="mailto:kontakt@swisscompact.com">SwissCompact kontaktieren</a></main>;
  const quote = state.quote!;
  if (state.result?.declined) return <main className="center success"><Mark/><div className="status-icon">✓</div><p className="eyebrow">Entscheidung gespeichert</p><h1>Vielen Dank für Ihre Rückmeldung.</h1><p>Die Offerte <b>{state.result.quoteNumber}</b> wurde abgelehnt. SwissCompact meldet sich bei Bedarf persönlich.</p><a href="/portal">Zurück zum Kundenportal</a></main>;
  if (state.result) return <main className="center success"><Mark/><div className="status-icon">✓</div><p className="eyebrow">Auftrag bestätigt</p><h1>Vielen Dank.</h1><p>Die Offerte <b>{state.result.quoteNumber}</b> wurde angenommen. Ihr Auftrag läuft unter <b>{state.result.orderNumber}</b>.</p><div className="result-card"><span>50-%-Anzahlungsrechnung</span><strong>{state.result.invoiceNumber}</strong><small>{state.result.invoiceSent ? "Die Rechnung wurde per E-Mail zugestellt." : "Die Rechnung ist erstellt und wird separat zugestellt."}</small></div><a href="/portal">Auftrag im Kundenportal ansehen</a></main>;
  const accepted = quote.status === "accepted";
  return <><header className="top"><Mark/><span>Persönlicher Offertenbereich</span></header><main className="offer-shell"><section className="offer-head"><div><p className="eyebrow">{quote.quoteNumber}</p><h1>{quote.projectTitle || "Ihre SwissCompact Lösung"}</h1><p>Für {quote.companyName}</p></div><div className="meta"><span>Gültig bis <b>{date(quote.validUntil)}</b></span><span>Status <b>{accepted ? "Angenommen" : "Zur Prüfung"}</b></span></div></section><section className="offer-card"><div className="table"><div className="table-head"><span>Leistung</span><span>Menge</span><span>Einzelpreis</span><span>Total</span></div>{quote.items.map((item, index) => <div className="line" key={index}><div><b>{item.description}</b><small>{item.unit}</small></div><span>{item.quantity}</span><span>{money(item.unitPriceChf)}</span><strong>{money(item.totalChf)}</strong></div>)}</div><div className="total"><span>Total exkl. MWST</span><strong>{money(quote.total)}</strong></div><p className="vat">SwissCompact ist derzeit nicht MWST-registriert.</p></section><section className="details"><article><p className="eyebrow">Konditionen</p><p>{quote.terms}</p></article><article><p className="eyebrow">Dokumentintegrität</p><p>Die dargestellte Version ist unveränderbar gespeichert.</p><code>{quote.documentHash?.slice(0, 24)}…</code>{quote.pdfUrl && <a className="download" href={quote.pdfUrl} target="_blank" rel="noreferrer">PDF herunterladen</a>}</article></section>{accepted ? <section className="accepted"><div className="status-icon">✓</div><div><h2>Offerte angenommen</h2><p>Angenommen durch {quote.acceptedByName} am {date(quote.acceptedAt)}.</p></div></section> : <section className="accept"><p className="eyebrow">Ihre Entscheidung</p><h2>Offerte prüfen und entscheiden</h2>{declining ? <form onSubmit={decline}><label>Name der zeichnungsberechtigten Person<input name="name" required autoComplete="name"/></label><label>E-Mail-Adresse<input name="email" type="email" required autoComplete="email"/></label><label>Rückmeldung an SwissCompact<textarea name="reason" rows={4} placeholder="Was passt für Sie noch nicht? (optional)"/></label><label className="consent"><input name="confirm" type="checkbox" required/><span>Ich habe die Offerte geprüft und möchte sie verbindlich ablehnen.</span></label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="decline-submit" disabled={busy}>{busy ? "Entscheidung wird gespeichert …" : "Offerte verbindlich ablehnen"}</button><button type="button" className="decision-back" onClick={() => { setDeclining(false); setFormError(""); }} disabled={busy}>Zurück zur Annahme</button></form> : <><p>Mit der Annahme wird die 50-%-Anzahlungsrechnung automatisch erstellt. Der Projektstart erfolgt nach Zahlungseingang.</p><form onSubmit={accept}><label>Name der zeichnungsberechtigten Person<input name="name" required autoComplete="name"/></label><label>E-Mail-Adresse<input name="email" type="email" required autoComplete="email"/></label><label className="consent"><input name="confirm" type="checkbox" required/><span>Ich bin zeichnungsberechtigt, habe die Offerte und Konditionen geprüft und nehme sie verbindlich an.</span></label>{formError && <p className="form-error" role="alert">{formError}</p>}<button disabled={busy}>{busy ? "Annahme wird sicher gespeichert …" : `Offerte über ${money(quote.total)} annehmen`}</button><button type="button" className="decision-decline" onClick={() => { setDeclining(true); setFormError(""); }}>Offerte ablehnen</button></form></>}</section>}<footer>SwissCompact · Marcel Spahr · Schwarzenburgstrasse 65 · 3008 Bern · kontakt@swisscompact.com</footer></main></>;
}

createRoot(document.getElementById("quote-root")!).render(<React.StrictMode><App/></React.StrictMode>);
