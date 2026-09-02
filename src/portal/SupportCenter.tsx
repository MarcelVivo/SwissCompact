import { FormEvent, useMemo, useState } from "react";

export type SupportPolicy = {
  package_code: string; support_label: string; coverage_description: string; critical_coverage: string;
  critical_response_minutes: number; high_response_minutes: number; normal_response_minutes: number; low_response_minutes: number;
  response_target_note: string;
};
export type SupportTicket = {
  id: string; ticket_number: string; affected_display_id?: string | null; category: string; priority: string; status: string;
  title: string; description: string; support_label_snapshot: string; coverage_snapshot: string; response_target_minutes: number;
  first_response_due_at: string; first_responded_at?: string | null; resolved_at?: string | null; created_at: string; updated_at: string;
  ai_handling_status?: string; ai_escalation_reason?: string | null; ai_confidence?: number | null;
};
export type SupportMessage = { id: string; ticket_id: string; author_type: string; author_name: string; body: string; created_at: string; generated_by_ai?: boolean };
export type SupportData = { available: boolean; policy: SupportPolicy | null; tickets: SupportTicket[]; messages: SupportMessage[] };

const priorityLabels: Record<string, string> = { low: "Tief", normal: "Normal", high: "Hoch", critical: "Kritisch" };
const statusLabels: Record<string, string> = { new: "Eingegangen", in_progress: "In Bearbeitung", waiting_customer: "Wartet auf Sie", resolved: "Gelöst", closed: "Geschlossen", cancelled: "Abgebrochen" };
const categoryLabels: Record<string, string> = { incident: "Technische Störung", question: "Bedienungsfrage", billing: "Abonnement & Rechnung", training: "Schulung", feature: "Funktionswunsch", content: "Inhalte & Kampagnen" };
const aiLabels: Record<string, string> = { eligible: "KI-Prüfung bereit", processing: "KI prüft", waiting_customer: "KI wartet auf Ihre Antwort", escalated: "An Supportteam übergeben", resolved: "Durch KI gelöst", disabled: "Persönliche Bearbeitung" };
const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "–";
const targetLabel = (minutes: number) => minutes % 540 === 0 ? `${minutes / 540} ${minutes === 540 ? "Arbeitstag" : "Arbeitstage"}` : `${minutes / 60} Std.`;

function SlaState({ ticket }: { ticket: SupportTicket }) {
  const due = new Date(ticket.first_response_due_at).getTime();
  const responded = ticket.first_responded_at ? new Date(ticket.first_responded_at).getTime() : null;
  const breached = responded ? responded > due : Date.now() > due;
  return <span className={`support-sla-state ${breached ? "breached" : responded ? "met" : "running"}`}>{responded ? breached ? "Reaktion nach Zielzeit" : "Reaktionsziel eingehalten" : breached ? "Reaktionsziel überschritten" : `Reaktion bis ${dateTime(ticket.first_response_due_at)}`}</span>;
}

export function SupportCenter({ data, displays, onCreate, onMessage }: {
  data: SupportData;
  displays: Array<{ id: string; name: string }>;
  onCreate: (payload: Record<string, unknown>) => Promise<string>;
  onMessage: (ticketId: string, message: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = data.tickets.find((ticket) => ticket.id === activeId) ?? null;
  const messages = useMemo(() => data.messages.filter((message) => message.ticket_id === activeId), [data.messages, activeId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      const ticketId = await onCreate({ category: form.get("category"), priority: form.get("priority"), title: form.get("title"), description: form.get("description"), displayId: form.get("displayId") || null });
      setCreating(false);
      setActiveId(ticketId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Supportanfrage konnte nicht erstellt werden"); }
    finally { setBusy(false); }
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!active) return; setBusy(true); setError(""); const replyForm = event.currentTarget; const form = new FormData(replyForm); const message = String(form.get("message") || "");
    try { await onMessage(active.id, message); replyForm.reset(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Nachricht konnte nicht gesendet werden"); }
    finally { setBusy(false); }
  }

  if (!data.available) return <section className="support-unavailable"><h2>Supportcenter</h2><p>Das Supportcenter wird mit der nächsten Datenbankmigration aktiviert.</p></section>;
  return <section className="support-center"><div className="section-title"><div><h2>Supportcenter</h2><p>Technische Hilfe mit transparentem Reaktionsziel Ihres Abonnements.</p></div><button type="button" className="primary" onClick={() => { setCreating(true); setError(""); }}>Supportanfrage erstellen</button></div>{data.policy && <article className="support-policy"><div><span>{data.policy.package_code}</span><h3>{data.policy.support_label}</h3><p>{data.policy.coverage_description}</p></div><dl><div><dt>Kritisch</dt><dd>{targetLabel(data.policy.critical_response_minutes)}</dd></div><div><dt>Hoch</dt><dd>{targetLabel(data.policy.high_response_minutes)}</dd></div><div><dt>Normal</dt><dd>{targetLabel(data.policy.normal_response_minutes)}</dd></div><div><dt>Tief</dt><dd>{targetLabel(data.policy.low_response_minutes)}</dd></div></dl><small>{data.policy.response_target_note}</small></article>}<div className="support-ticket-list">{data.tickets.map((ticket) => <button type="button" key={ticket.id} onClick={() => { setActiveId(ticket.id); setError(""); }}><span className={`support-priority ${ticket.priority}`}>{priorityLabels[ticket.priority]}</span><div><small>{ticket.ticket_number} · {categoryLabels[ticket.category]}</small><strong>{ticket.title}</strong><SlaState ticket={ticket}/>{ticket.ai_handling_status && <span className={`support-ai-inline ${ticket.ai_handling_status}`}>{aiLabels[ticket.ai_handling_status]}</span>}</div><em className={`support-status ${ticket.status}`}>{statusLabels[ticket.status]}</em></button>)}{!data.tickets.length && <div className="support-empty"><b>Noch keine Supportanfrage</b><span>Bei technischen Störungen oder Fragen erreichen Sie SwissCompact direkt hier.</span></div>}</div>{creating && <div className="dialog-backdrop"><section className="dialog support-create-dialog" role="dialog" aria-modal="true"><button type="button" className="dialog-close" onClick={() => setCreating(false)}>×</button><div className="eyebrow">Neue Supportanfrage</div><h2>Wie können wir helfen?</h2><form onSubmit={create}><div className="support-form-row"><label>Kategorie<select name="category" defaultValue="incident"><option value="incident">Technische Störung</option><option value="question">Bedienungsfrage</option><option value="content">Inhalte & Kampagnen</option><option value="billing">Abonnement & Rechnung</option><option value="training">Schulung</option><option value="feature">Funktionswunsch</option></select></label><label>Priorität<select name="priority" defaultValue="normal"><option value="low">Tief – keine Eile</option><option value="normal">Normal – Betrieb möglich</option><option value="high">Hoch – Betrieb stark beeinträchtigt</option><option value="critical">Kritisch – Totalausfall oder Sicherheitsproblem</option></select></label></div><label>Betroffener Bildschirm (optional)<select name="displayId"><option value="">Gesamtes Portal oder nicht zugeordnet</option>{displays.map((display) => <option value={display.id} key={display.id}>{display.name}</option>)}</select></label><label>Kurzer Titel<input name="title" required minLength={3} maxLength={180} autoFocus placeholder="z. B. Display im Eingangsbereich bleibt schwarz"/></label><label>Was ist passiert?<textarea name="description" required minLength={10} maxLength={8000} rows={7} placeholder="Seit wann besteht das Problem, was wird angezeigt und was haben Sie bereits versucht?"/></label><p className="support-ai-disclosure"><strong>KI-Erstsupport:</strong> Ein klar gekennzeichneter Assistent prüft Ihre Anfrage zuerst. Sensible oder unklare Fälle werden automatisch an das SwissCompact-Supportteam übergeben. Sie können jederzeit eine persönliche Bearbeitung verlangen.</p><p className="support-critical-note"><strong>„Kritisch“</strong> ist für Totalausfälle oder akute Sicherheitsprobleme vorgesehen. Das Ziel beschreibt die erste persönliche Reaktion, nicht die vollständige Lösung.</p>{error && <p className="form-error">{error}</p>}<footer><button type="button" className="secondary" onClick={() => setCreating(false)}>Abbrechen</button><button className="primary" disabled={busy}>{busy ? "Wird gesendet …" : "Supportanfrage senden"}</button></footer></form></section></div>}{active && <div className="dialog-backdrop"><section className="dialog support-ticket-dialog" role="dialog" aria-modal="true"><button type="button" className="dialog-close" onClick={() => setActiveId(null)}>×</button><div className="eyebrow">{active.ticket_number} · {statusLabels[active.status]}</div><h2>{active.title}</h2><div className="support-ticket-meta"><span>{priorityLabels[active.priority]}</span><span>{categoryLabels[active.category]}</span><span>{active.support_label_snapshot}</span></div><p className="support-description">{active.description}</p><SlaState ticket={active}/>{active.ai_handling_status && <div className={`support-ai-state ${active.ai_handling_status}`}><b>{aiLabels[active.ai_handling_status]}</b>{active.ai_handling_status === "escalated" && active.ai_escalation_reason && <span>{active.ai_escalation_reason}</span>}<small>KI-Antworten sind als „SwissCompact KI-Support“ gekennzeichnet.</small></div>}<div className="support-conversation">{messages.map((message) => <article className={`${message.author_type}${message.generated_by_ai ? " ai" : ""}`} key={message.id}><header><b>{message.author_name}{message.generated_by_ai ? " · KI-Assistent" : ""}</b><time>{dateTime(message.created_at)}</time></header><p>{message.body}</p></article>)}{!messages.length && <p className="support-no-message">Noch keine zusätzliche Nachricht.</p>}</div>{!["closed","cancelled"].includes(active.status) && <form className="support-reply" onSubmit={reply}><label>Nachricht ergänzen<textarea name="message" rows={4} required maxLength={8000}/></label>{error && <p className="form-error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Wird gesendet …" : "Nachricht senden"}</button></form>}</section></div>}</section>;
}
