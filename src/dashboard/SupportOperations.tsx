import { FormEvent, useMemo, useState } from "react";

type SupportData = { available: boolean; aiAvailable: boolean; policies: any[]; tickets: any[]; messages: any[]; knowledge: any[] };
const priorityLabels: Record<string, string> = { low: "Tief", normal: "Normal", high: "Hoch", critical: "Kritisch" };
const statusLabels: Record<string, string> = { new: "Neu", in_progress: "In Bearbeitung", waiting_customer: "Wartet auf Kunde", resolved: "Gelöst", closed: "Geschlossen", cancelled: "Abgebrochen" };
const categoryLabels: Record<string, string> = { incident: "Störung", question: "Bedienungsfrage", billing: "Abo & Rechnung", training: "Schulung", feature: "Funktionswunsch", content: "Inhalte" };
const aiLabels: Record<string, string> = { eligible: "KI bereit", processing: "KI prüft", waiting_customer: "KI wartet auf Kunde", escalated: "Admin erforderlich", resolved: "KI gelöst", disabled: "Persönlich übernommen" };
const knowledgeCategoryLabels: Record<string, string> = { general: "Allgemein", incident: "Störungen", question: "Bedienung", training: "Schulung", content: "Inhalte & Kampagnen" };
const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "–";
const relationName = (value: any) => Array.isArray(value) ? value[0]?.name : value?.name;
const targetHours = (minutes: number) => minutes % 540 === 0 ? `${minutes / 540} AT` : `${minutes / 60} h`;

const editableStatuses: Record<string, string[]> = {
  new: ["new", "in_progress", "waiting_customer", "cancelled"],
  in_progress: ["in_progress", "waiting_customer", "cancelled"],
  waiting_customer: ["waiting_customer", "in_progress", "cancelled"],
  resolved: ["resolved"],
  closed: ["closed"],
  cancelled: ["cancelled"],
};

function ticketSla(ticket: any) {
  const due = new Date(ticket.first_response_due_at).getTime();
  const response = ticket.first_responded_at ? new Date(ticket.first_responded_at).getTime() : null;
  const breached = response ? response > due : Date.now() > due;
  return { breached, label: response ? breached ? "zu spät reagiert" : "Ziel eingehalten" : breached ? "überfällig" : `bis ${dateTime(ticket.first_response_due_at)}` };
}

export function SupportOperations({ data, profiles, securityAdmin, canManage, mutate }: { data: SupportData; profiles: any[]; securityAdmin: boolean; canManage: boolean; mutate: (payload: any) => Promise<any> }) {
  const [filter, setFilter] = useState("open");
  const [active, setActive] = useState<any | null>(null);
  const [policy, setPolicy] = useState<any | null>(null);
  const [closeConfirmation, setCloseConfirmation] = useState(false);
  const [knowledgeEditor, setKnowledgeEditor] = useState<any | null>(null);
  const [knowledgeAction, setKnowledgeAction] = useState<{ entry: any; action: "approve" | "archive" | "delete" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const openTickets = data.tickets.filter((ticket) => !["resolved", "closed", "cancelled"].includes(ticket.status));
  const visible = useMemo(() => data.tickets.filter((ticket) => filter === "all" || filter === "open" && !["resolved", "closed", "cancelled"].includes(ticket.status) || ticket.status === filter), [data.tickets, filter]);
  const breached = openTickets.filter((ticket) => ticketSla(ticket).breached && !ticket.first_responded_at);

  function openTicket(ticket: any) {
    setActive(ticket);
    setCloseConfirmation(false);
    setError("");
  }

  function closeTicketDialog() {
    setActive(null);
    setCloseConfirmation(false);
    setError("");
  }

  async function updateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active) return;
    const form = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const resolve = submitter?.value === "resolve";
    const publicResponse = String(form.get("publicResponse") || "").trim();
    if (resolve && !publicResponse) {
      setError("Beschreiben Sie dem Kunden kurz die Lösung, bevor der Fall als gelöst markiert wird.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await mutate({
        action: "update_support_ticket",
        id: active.id,
        status: resolve ? "resolved" : form.get("status"),
        priority: form.get("priority"),
        assignedTo: form.get("assignedTo") || null,
        publicResponse,
        internalNote: form.get("internalNote"),
      });
      closeTicketDialog();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Supportfall konnte nicht gespeichert werden");
    } finally {
      setBusy(false);
    }
  }

  async function changeLifecycleStatus(status: "in_progress" | "closed") {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      await mutate({
        action: "update_support_ticket",
        id: active.id,
        status,
        priority: active.priority,
        assignedTo: active.assigned_to || null,
      });
      closeTicketDialog();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Supportfall konnte nicht aktualisiert werden");
      setCloseConfirmation(false);
    } finally {
      setBusy(false);
    }
  }

  async function changeAiMode(mode: "resume" | "takeover") {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      await mutate({ action: "set_support_ai_mode", id: active.id, mode });
      closeTicketDialog();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "KI-Erstsupport konnte nicht aktualisiert werden");
    } finally {
      setBusy(false);
    }
  }

  async function updatePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await mutate({ action: "update_sla_policy", packageCode: policy.package_code, supportLabel: form.get("supportLabel"), coverageDescription: form.get("coverageDescription"), criticalCoverage: form.get("criticalCoverage"), criticalResponseMinutes: Number(form.get("criticalHours")) * 60, highResponseMinutes: Number(form.get("highHours")) * 60, normalResponseMinutes: Number(form.get("normalHours")) * 60, lowResponseMinutes: Number(form.get("lowHours")) * 60 });
      setPolicy(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "SLA-Regel konnte nicht gespeichert werden");
    } finally {
      setBusy(false);
    }
  }

  function editKnowledge(entry?: any) {
    setKnowledgeEditor(entry || { id: null, category: "general", title: "", content: "", source_reference: "" });
    setError("");
  }

  async function saveKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!knowledgeEditor) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await mutate({
        action: knowledgeEditor.id ? "update_support_ai_knowledge" : "create_support_ai_knowledge",
        id: knowledgeEditor.id || undefined,
        updatedAt: knowledgeEditor.updated_at || undefined,
        category: form.get("category"),
        title: form.get("title"),
        content: form.get("content"),
        sourceReference: form.get("sourceReference"),
      });
      setKnowledgeEditor(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wissenseintrag konnte nicht gespeichert werden");
    } finally {
      setBusy(false);
    }
  }

  async function confirmKnowledgeAction() {
    if (!knowledgeAction) return;
    setBusy(true);
    setError("");
    try {
      await mutate({ action: `${knowledgeAction.action}_support_ai_knowledge`, id: knowledgeAction.entry.id });
      setKnowledgeAction(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wissenseintrag konnte nicht aktualisiert werden");
    } finally {
      setBusy(false);
    }
  }

  if (!data.available) return <><header className="page-head"><div><p className="eyebrow">Kundenbetrieb</p><h1>Support</h1><p>Die Support-SLA-Migration muss noch ausgeführt werden.</p></div></header></>;

  const lifecycleOptions = active ? editableStatuses[active.status] || [active.status] : [];
  const activeLifecycle = active?.status === "resolved" || active?.status === "closed" || active?.status === "cancelled";

  return <>
    <header className="page-head"><div><p className="eyebrow">Kundenbetrieb</p><h1>Support & SLA</h1><p>Supportfälle nach Priorität, Reaktionsziel und Abonnement bearbeiten.</p></div></header>
    <section className="stats support-stats">
      <article><span>Offen</span><strong>{openTickets.length}</strong><small>aktive Supportfälle</small></article>
      <article className={breached.length ? "danger" : ""}><span>SLA überfällig</span><strong>{breached.length}</strong><small>ohne erste Reaktion</small></article>
      <article><span>Kritisch</span><strong>{openTickets.filter((ticket) => ticket.priority === "critical").length}</strong><small>sofort prüfen</small></article>
      <article><span>Wartet auf Kunde</span><strong>{openTickets.filter((ticket) => ticket.status === "waiting_customer").length}</strong><small>Antwort ausstehend</small></article>
      <article className={openTickets.some((ticket) => ticket.ai_handling_status === "escalated") ? "danger" : ""}><span>KI eskaliert</span><strong>{openTickets.filter((ticket) => ticket.ai_handling_status === "escalated").length}</strong><small>persönliche Bearbeitung nötig</small></article>
    </section>

    <section className="panel support-policy-panel">
      <div className="panel-head"><div><h3>Supportmodelle</h3><p>Erstreaktionsziele je aktivem Abonnement. Eine Zielzeit ist keine garantierte Lösungszeit.</p></div></div>
      <div className="dashboard-policy-grid">{data.policies.map((entry) => <article key={entry.package_code}><span>{entry.package_code}</span><h4>{entry.support_label}</h4><p>{entry.coverage_description}</p><dl><div><dt>Kritisch</dt><dd>{targetHours(entry.critical_response_minutes)}</dd></div><div><dt>Hoch</dt><dd>{targetHours(entry.high_response_minutes)}</dd></div><div><dt>Normal</dt><dd>{targetHours(entry.normal_response_minutes)}</dd></div><div><dt>Tief</dt><dd>{targetHours(entry.low_response_minutes)}</dd></div></dl>{securityAdmin && <button type="button" className="secondary" onClick={() => { setPolicy(entry); setError(""); }}>Regel bearbeiten</button>}</article>)}</div>
    </section>

    <section className="panel support-knowledge-panel">
      <div className="panel-head"><div><h3>KI-Wissensbasis</h3><p>Nur freigegebene Anleitungen werden für Kundenantworten verwendet. Jede Bearbeitung zieht die Freigabe automatisch zurück.</p></div>{canManage && <button type="button" className="primary" onClick={() => editKnowledge()}>Neue Anleitung</button>}</div>
      {!data.aiAvailable ? <p className="support-queue-empty">Die Migration für den KI-Erstsupport muss noch ausgeführt werden.</p> : <>
        <div className="support-knowledge-summary"><span><b>{data.knowledge.filter((entry) => entry.active).length}</b> freigegeben</span><span><b>{data.knowledge.filter((entry) => !entry.active && !entry.approved_at).length}</b> Entwürfe</span><span><b>{data.knowledge.filter((entry) => !entry.active && entry.approved_at).length}</b> archiviert</span></div>
        <div className="support-knowledge-grid">{data.knowledge.map((entry) => { const state = entry.active ? "approved" : entry.approved_at ? "archived" : "draft"; return <article className={state} key={entry.id}><header><div><small>{knowledgeCategoryLabels[entry.category] || entry.category}</small><h4>{entry.title}</h4></div><span>{state === "approved" ? "Freigegeben" : state === "archived" ? "Archiviert" : "Entwurf"}</span></header><p>{entry.content}</p><footer><div><small>{entry.source_reference || "Interne Anleitung"}</small><small>{entry.active ? `Freigegeben ${dateTime(entry.approved_at)}${entry.approved_by_name ? ` · ${entry.approved_by_name}` : ""}` : `Geändert ${dateTime(entry.updated_at)}`}</small></div>{canManage && <div className="support-knowledge-actions"><button type="button" className="secondary" onClick={() => editKnowledge(entry)}>Bearbeiten</button>{entry.active && <button type="button" className="secondary" onClick={() => setKnowledgeAction({ entry, action: "archive" })}>Archivieren</button>}{!entry.active && securityAdmin && <button type="button" className="primary" onClick={() => setKnowledgeAction({ entry, action: "approve" })}>Freigeben</button>}{!entry.active && !entry.approved_at && securityAdmin && <button type="button" className="secondary danger" onClick={() => setKnowledgeAction({ entry, action: "delete" })}>Entwurf löschen</button>}</div>}</footer></article>; })}{!data.knowledge.length && <p className="support-queue-empty">Noch keine KI-Anleitungen vorhanden.</p>}</div>
      </>}
    </section>

    <section className="panel support-queue">
      <div className="panel-head"><div><h3>Support-Warteschlange</h3><p>Fällige und kritische Fälle zuerst.</p></div><label>Status<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="open">Offene Fälle</option><option value="all">Alle</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
      <div className="support-queue-list">{visible.map((ticket) => { const sla = ticketSla(ticket); return <button type="button" className={`${ticket.priority} ${sla.breached && !ticket.first_responded_at ? "breached" : ""}`} key={ticket.id} onClick={() => openTicket(ticket)}><span className={`support-queue-priority ${ticket.priority}`}>{priorityLabels[ticket.priority]}</span><div><small>{ticket.ticket_number} · {relationName(ticket.tenant) || "Kundenportal"} · {categoryLabels[ticket.category]}</small><strong>{ticket.title}</strong><em className={sla.breached ? "breached" : ""}>{sla.label}</em>{ticket.ai_handling_status && <em className={`support-ai-admin-label ${ticket.ai_handling_status}`}>{aiLabels[ticket.ai_handling_status]}</em>}</div><span className={`tag ${ticket.status === "resolved" ? "success" : ticket.status === "waiting_customer" ? "warning" : ""}`}>{statusLabels[ticket.status]}</span></button>; })}{!visible.length && <p className="support-queue-empty">Keine Supportfälle in dieser Ansicht.</p>}</div>
    </section>

    {active && <div className="dashboard-dialog-backdrop"><section className="dashboard-dialog support-operations-dialog" role="dialog" aria-modal="true" aria-labelledby="support-ticket-title">
      <header><div><p className="eyebrow">{active.ticket_number} · {relationName(active.tenant)}</p><h2 id="support-ticket-title">{active.title}</h2></div><button className="icon-button" onClick={closeTicketDialog} aria-label="Supportfall schließen">×</button></header>
      <div className="support-ops-description"><b>Kundenbeschreibung</b><p>{active.description}</p><small>{categoryLabels[active.category]} · Paket {active.package_code_snapshot} · eingegangen {dateTime(active.created_at)}</small></div>
      {active.ai_handling_status && <div className={`support-ai-admin-state ${active.ai_handling_status}`}><b>{aiLabels[active.ai_handling_status]}</b>{active.ai_escalation_reason && <span>{active.ai_escalation_reason}</span>}<small>{active.ai_attempt_count || 0} KI-Versuche{active.ai_confidence != null ? ` · Sicherheit ${Math.round(Number(active.ai_confidence) * 100)} %` : ""}</small></div>}
      {active.status === "resolved" && <div className="support-lifecycle-note resolved"><b>✓ Lösung an den Kunden gesendet</b><span>Eine Kundenantwort öffnet den Fall automatisch wieder. Ohne Rückfrage kann er endgültig geschlossen werden.</span></div>}
      {active.status === "closed" && <div className="support-lifecycle-note closed"><b>Fall endgültig geschlossen</b><span>Der Kunde kann in diesem Ticket keine weiteren Nachrichten senden.</span></div>}
      {active.status === "cancelled" && <div className="support-lifecycle-note cancelled"><b>Fall abgebrochen</b><span>Dieser Fall kann nicht weiterbearbeitet werden.</span></div>}
      <div className="support-ops-conversation">{data.messages.filter((message) => message.ticket_id === active.id).map((message) => <article className={`${message.visible_to_customer ? message.author_type : "internal"}${message.generated_by_ai ? " ai" : ""}`} key={message.id}><header><b>{message.author_name}{message.generated_by_ai ? " · KI-Assistent" : !message.visible_to_customer ? " · interne Notiz" : ""}</b><time>{dateTime(message.created_at)}</time></header><p>{message.body}</p></article>)}</div>
      <form onSubmit={updateTicket}>
        {activeLifecycle && <input type="hidden" name="status" value={active.status}/>}<div className="form-row"><label>Status<select name={activeLifecycle ? undefined : "status"} defaultValue={active.status} disabled={activeLifecycle}>{lifecycleOptions.map((value) => <option value={value} key={value}>{statusLabels[value]}</option>)}</select></label><label>Priorität<select name="priority" defaultValue={active.priority}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
        <label>Zuständig<select name="assignedTo" defaultValue={active.assigned_to || ""}><option value="">Noch nicht zugewiesen</option>{profiles.map((entry) => <option value={entry.user_id} key={entry.user_id}>{entry.display_name}</option>)}</select></label>
        {!activeLifecycle && <label>Sichtbare Antwort an den Kunden<textarea name="publicResponse" rows={5} placeholder="Antwort, Rückfrage oder Lösung für das Kundenportal"/></label>}
        {active.status !== "cancelled" && <label>Interne Notiz<textarea name="internalNote" rows={3} placeholder="Nur für SwissCompact sichtbar"/></label>}
        {error && <p className="form-error">{error}</p>}
        <footer className="support-ticket-actions">
          <button type="button" className="secondary" onClick={closeTicketDialog}>Zurück</button>
          {!activeLifecycle && active.ai_handling_status !== "disabled" && <button type="button" className="secondary" disabled={busy} onClick={() => void changeAiMode("takeover")}>Persönlich übernehmen</button>}
          {!activeLifecycle && ["escalated", "disabled"].includes(active.ai_handling_status) && <button type="button" className="secondary" disabled={busy} onClick={() => void changeAiMode("resume")}>KI erneut versuchen</button>}
          {active.status !== "cancelled" && <button className="secondary" disabled={busy}>{busy ? "Wird gespeichert …" : "Änderungen speichern"}</button>}
          {!activeLifecycle && <button className="primary support-resolve" name="intent" value="resolve" disabled={busy}>Als gelöst markieren</button>}
          {active.status === "resolved" && <button type="button" className="secondary support-reopen" disabled={busy} onClick={() => void changeLifecycleStatus("in_progress")}>Erneut öffnen</button>}
          {active.status === "resolved" && <button type="button" className="secondary danger support-close" disabled={busy} onClick={() => setCloseConfirmation(true)}>Endgültig schließen</button>}
        </footer>
      </form>
    </section></div>}

    {active && closeConfirmation && <div className="dashboard-dialog-backdrop support-close-backdrop"><section className="dashboard-dialog support-close-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="support-close-title">
      <header><div><p className="eyebrow">{active.ticket_number}</p><h2 id="support-close-title">Ticket endgültig schließen?</h2></div></header>
      <p>Der Fall verschwindet aus der offenen Warteschlange. Der Kunde kann anschließend nicht mehr antworten und ein geschlossenes Ticket kann nicht erneut geöffnet werden.</p>
      <div className="support-close-summary"><span>Kunde</span><b>{relationName(active.tenant) || "Kundenportal"}</b><span>Fall</span><b>{active.title}</b></div>
      {error && <p className="form-error">{error}</p>}
      <footer><button type="button" className="secondary" disabled={busy} onClick={() => setCloseConfirmation(false)}>Noch nicht schließen</button><button type="button" className="primary danger" disabled={busy} onClick={() => void changeLifecycleStatus("closed")}>{busy ? "Wird geschlossen …" : "Ja, Ticket schließen"}</button></footer>
    </section></div>}

    {knowledgeEditor && <div className="dashboard-dialog-backdrop"><section className="dashboard-dialog support-knowledge-dialog" role="dialog" aria-modal="true" aria-labelledby="knowledge-dialog-title"><header><div><p className="eyebrow">KI-Wissensbasis</p><h2 id="knowledge-dialog-title">{knowledgeEditor.id ? "Anleitung bearbeiten" : "Neue Anleitung"}</h2></div><button type="button" className="icon-button" onClick={() => setKnowledgeEditor(null)} aria-label="Dialog schliessen">×</button></header><form onSubmit={saveKnowledge}><label>Kategorie<select name="category" defaultValue={knowledgeEditor.category}>{Object.entries(knowledgeCategoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Titel<input name="title" required minLength={3} maxLength={180} defaultValue={knowledgeEditor.title} placeholder="Eindeutige Bezeichnung der Anleitung"/></label><label>Freigegebene Quelle oder Referenz<input name="sourceReference" maxLength={500} defaultValue={knowledgeEditor.source_reference || ""} placeholder="z. B. Betriebsanleitung Version 2.1"/></label><label>Anleitung für den KI-Support<textarea name="content" required minLength={10} maxLength={12000} rows={12} defaultValue={knowledgeEditor.content} placeholder="Klare, überprüfbare Schritte sowie Grenzen und Eskalationskriterien"/></label>{knowledgeEditor.active && <p className="support-knowledge-warning"><strong>Freigabe wird zurückgezogen:</strong> Nach dem Speichern verwendet die KI diese Anleitung erst wieder, wenn der Hauptadmin die geänderte Fassung freigegeben hat.</p>}{error && <p className="form-error">{error}</p>}<footer><button type="button" className="secondary" disabled={busy} onClick={() => setKnowledgeEditor(null)}>Abbrechen</button><button className="primary" disabled={busy}>{busy ? "Wird gespeichert …" : "Als Entwurf speichern"}</button></footer></form></section></div>}

    {knowledgeAction && <div className="dashboard-dialog-backdrop support-close-backdrop"><section className="dashboard-dialog support-knowledge-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="knowledge-action-title"><header><div><p className="eyebrow">KI-Wissensbasis</p><h2 id="knowledge-action-title">{knowledgeAction.action === "approve" ? "Anleitung für Kundenantworten freigeben?" : knowledgeAction.action === "archive" ? "Anleitung archivieren?" : "Entwurf endgültig löschen?"}</h2></div></header><p>{knowledgeAction.action === "approve" ? "Die KI darf den folgenden Text danach unmittelbar für neue Supportantworten verwenden. Prüfen Sie Inhalt, Sicherheitsgrenzen und Quelle vollständig." : knowledgeAction.action === "archive" ? "Die KI verwendet diese Anleitung ab sofort nicht mehr. Der Eintrag bleibt als Nachweis erhalten und kann später erneut freigegeben werden." : "Dieser ungeprüfte Entwurf wird dauerhaft entfernt. Bereits freigegebene Einträge können nicht gelöscht, sondern nur archiviert werden."}</p><div className="support-knowledge-confirm-title"><span>{knowledgeCategoryLabels[knowledgeAction.entry.category]}</span><b>{knowledgeAction.entry.title}</b></div>{error && <p className="form-error">{error}</p>}<footer><button type="button" className="secondary" disabled={busy} onClick={() => setKnowledgeAction(null)}>Abbrechen</button><button type="button" className={`primary ${knowledgeAction.action === "delete" ? "danger" : ""}`} disabled={busy} onClick={() => void confirmKnowledgeAction()}>{busy ? "Wird verarbeitet …" : knowledgeAction.action === "approve" ? "Geprüft und freigeben" : knowledgeAction.action === "archive" ? "Jetzt archivieren" : "Entwurf löschen"}</button></footer></section></div>}

    {policy && <div className="dashboard-dialog-backdrop"><section className="dashboard-dialog" role="dialog" aria-modal="true"><header><div><p className="eyebrow">Paket {policy.package_code}</p><h2>SLA-Regel bearbeiten</h2></div><button className="icon-button" onClick={() => setPolicy(null)}>×</button></header><form onSubmit={updatePolicy}><label>Bezeichnung<input name="supportLabel" defaultValue={policy.support_label} required/></label><label>Supportzeiten und Erklärung<textarea name="coverageDescription" defaultValue={policy.coverage_description} rows={3} required/></label><label>Kritische Abdeckung<select name="criticalCoverage" defaultValue={policy.critical_coverage}><option value="business_hours">Nur Supportzeiten</option><option value="24x7">Rund um die Uhr</option></select></label><div className="sla-target-grid"><label>Kritisch (Stunden)<input name="criticalHours" type="number" min="0.25" step="0.25" defaultValue={policy.critical_response_minutes / 60}/></label><label>Hoch (Stunden)<input name="highHours" type="number" min="0.25" step="0.25" defaultValue={policy.high_response_minutes / 60}/></label><label>Normal (Stunden)<input name="normalHours" type="number" min="0.25" step="0.25" defaultValue={policy.normal_response_minutes / 60}/></label><label>Tief (Stunden)<input name="lowHours" type="number" min="0.25" step="0.25" defaultValue={policy.low_response_minutes / 60}/></label></div><p className="sla-warning">Diese Änderungen gelten nur für neu erstellte Supportfälle. Bereits eröffnete Fälle behalten ihren vereinbarten Snapshot.</p>{error && <p className="form-error">{error}</p>}<footer><button type="button" className="secondary" onClick={() => setPolicy(null)}>Abbrechen</button><button className="primary" disabled={busy}>SLA-Regel speichern</button></footer></form></section></div>}
  </>;
}
