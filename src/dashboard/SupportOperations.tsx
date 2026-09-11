import { FormEvent, useEffect, useMemo, useState } from "react";

type SupportData = { available: boolean; aiAvailable: boolean; controlCenterAvailable: boolean; attachmentsAvailable: boolean; policies: any[]; tickets: any[]; messages: any[]; knowledge: any[]; runs: any[]; feedback: any[]; attachments: any[] };
const priorityLabels: Record<string, string> = { low: "Tief", normal: "Normal", high: "Hoch", critical: "Kritisch" };
const statusLabels: Record<string, string> = { new: "Neu", in_progress: "In Bearbeitung", waiting_customer: "Wartet auf Kunde", resolved: "Gelöst", closed: "Geschlossen", cancelled: "Abgebrochen" };
const categoryLabels: Record<string, string> = { incident: "Störung", question: "Bedienungsfrage", billing: "Abo & Rechnung", training: "Schulung", feature: "Funktionswunsch", content: "Inhalte" };
const aiLabels: Record<string, string> = { eligible: "KI bereit", processing: "KI prüft", waiting_customer: "KI wartet auf Kunde", escalated: "Admin erforderlich", resolved: "KI gelöst", disabled: "Persönlich übernommen" };
const knowledgeCategoryLabels: Record<string, string> = { general: "Allgemein", incident: "Störungen", question: "Bedienung", training: "Schulung", content: "Inhalte & Kampagnen" };
const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "–";
const relationName = (value: any) => Array.isArray(value) ? value[0]?.name : value?.name;
const targetHours = (minutes: number) => minutes % 540 === 0 ? `${minutes / 540} AT` : `${minutes / 60} h`;
const countLabel = (value: number) => new Intl.NumberFormat("de-CH").format(value);
const percentLabel = (value: number, total: number) => total ? `${Math.round(value / total * 100)} %` : "–";
const usdLabel = (value: number) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "USD", minimumFractionDigits: value < 0.01 ? 4 : 2, maximumFractionDigits: 4 }).format(value);
const supportFileTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const fileSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

async function supportRecords(payload: Record<string, unknown>): Promise<any> {
  const response = await fetch("/api/dashboard/records", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Supportaktion fehlgeschlagen");
  return result;
}

function selectedSupportFiles(current: File[], incoming: FileList | null): File[] {
  const files = [...current, ...Array.from(incoming || [])];
  if (files.length > 5) throw new Error("Wählen Sie höchstens fünf Dateien pro Antwort aus.");
  const invalid = files.find((file) => !supportFileTypes.has(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024);
  if (invalid) throw new Error(`„${invalid.name}“ wird nicht unterstützt. Erlaubt sind JPG, PNG, WebP und PDF bis 10 MB.`);
  return files;
}

function AdminAttachments({ attachments, onOpen }: { attachments: any[]; onOpen: (attachment: any) => void }) {
  if (!attachments.length) return null;
  return <div className="support-admin-attachments">{attachments.map((attachment) => <button type="button" key={attachment.id} onClick={() => onOpen(attachment)}><span>{attachment.mime_type?.startsWith("image/") ? "▧" : "PDF"}</span><span><b>{attachment.file_name}</b><small>{fileSize(Number(attachment.size_bytes || 0))} · {attachment.uploaded_by_type === "customer" ? "vom Kunden" : "von SwissCompact"}</small></span><i>Öffnen →</i></button>)}</div>;
}

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

export function SupportOperations({ data, profiles, securityAdmin, canManage, focusTicketId, onTicketOpened, mutate }: { data: SupportData; profiles: any[]; securityAdmin: boolean; canManage: boolean; focusTicketId?: string | null; onTicketOpened?: () => void; mutate: (payload: any) => Promise<any> }) {
  const [filter, setFilter] = useState("open");
  const [active, setActive] = useState<any | null>(null);
  const [policy, setPolicy] = useState<any | null>(null);
  const [closeConfirmation, setCloseConfirmation] = useState(false);
  const [knowledgeEditor, setKnowledgeEditor] = useState<any | null>(null);
  const [knowledgeAction, setKnowledgeAction] = useState<{ entry: any; action: "approve" | "archive" | "delete" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [responseFiles, setResponseFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState("");
  const openTickets = data.tickets.filter((ticket) => !["resolved", "closed", "cancelled"].includes(ticket.status));
  const visible = useMemo(() => data.tickets.filter((ticket) => filter === "all" || filter === "open" && !["resolved", "closed", "cancelled"].includes(ticket.status) || ticket.status === filter), [data.tickets, filter]);
  const breached = openTickets.filter((ticket) => ticketSla(ticket).breached && !ticket.first_responded_at);
  const finishedRuns = data.runs.filter((run) => ["responded", "resolved", "escalated", "failed"].includes(run.status));
  const successfulRuns = finishedRuns.filter((run) => ["responded", "resolved"].includes(run.status));
  const escalatedRuns = finishedRuns.filter((run) => run.status === "escalated");
  const failedRuns = data.runs.filter((run) => run.status === "failed");
  const interventionTickets = openTickets.filter((ticket) => ticket.ai_handling_status === "escalated");
  const totalTokens = data.runs.reduce((sum, run) => sum + Number(run.total_tokens || 0), 0);
  const totalCost = data.runs.reduce((sum, run) => sum + Number(run.estimated_cost_usd || 0), 0);
  const helpfulFeedback = data.feedback.filter((entry) => entry.rating === "helpful");
  const negativeFeedback = data.feedback.filter((entry) => entry.rating === "not_helpful");

  useEffect(() => {
    if (!focusTicketId) return;
    const ticket = data.tickets.find((entry) => entry.id === focusTicketId);
    if (!ticket) return;
    openTicket(ticket);
    onTicketOpened?.();
  }, [data.tickets, focusTicketId, onTicketOpened]);

  function openTicket(ticket: any) {
    setActive(ticket);
    setCloseConfirmation(false);
    setResponseFiles([]);
    setError("");
  }

  function closeTicketDialog() {
    setActive(null);
    setCloseConfirmation(false);
    setResponseFiles([]);
    setUploadState("");
    setError("");
  }

  async function uploadAttachment(ticketId: string, file: File): Promise<string> {
    const prepared = await supportRecords({ action: "prepare_support_attachment", ticketId, fileName: file.name, mimeType: file.type, sizeBytes: file.size });
    const uploadBody = new FormData();
    uploadBody.append("cacheControl", "3600");
    uploadBody.append("", file, file.name);
    const uploaded = await fetch(prepared.upload.signedUrl, { method: "PUT", body: uploadBody, headers: { "x-upsert": "false" } });
    if (!uploaded.ok) throw new Error("Die Datei konnte nicht sicher übertragen werden.");
    await supportRecords({ action: "finalize_support_attachment", attachmentId: prepared.attachment.id });
    return prepared.attachment.id;
  }

  async function openAttachment(attachment: any) {
    const target = window.open("about:blank", "_blank");
    setError("");
    try {
      const result = await fetch(`/api/dashboard/records?supportAttachment=${encodeURIComponent(attachment.id)}`, { credentials: "same-origin" });
      const body = await result.json().catch(() => ({}));
      if (!result.ok || !body.url) throw new Error(body.error || "Anhang konnte nicht geöffnet werden");
      if (target) target.location.href = body.url; else location.assign(body.url);
    } catch (reason) {
      target?.close();
      setError(reason instanceof Error ? reason.message : "Anhang konnte nicht geöffnet werden");
    }
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
      if (responseFiles.length && !publicResponse) throw new Error("Ergänzen Sie zu den Dateien eine kurze sichtbare Nachricht für den Kunden.");
      const attachmentIds: string[] = [];
      for (let index = 0; index < responseFiles.length; index += 1) {
        setUploadState(`Datei ${index + 1} von ${responseFiles.length} wird sicher übertragen …`);
        attachmentIds.push(await uploadAttachment(active.id, responseFiles[index]));
      }
      setUploadState(responseFiles.length ? "Dateien bereit. Antwort wird gespeichert …" : "");
      await mutate({
        action: "update_support_ticket",
        id: active.id,
        status: resolve ? "resolved" : form.get("status"),
        priority: form.get("priority"),
        assignedTo: form.get("assignedTo") || null,
        publicResponse,
        internalNote: form.get("internalNote"),
        attachmentIds,
      });
      closeTicketDialog();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Supportfall konnte nicht gespeichert werden");
    } finally {
      setBusy(false);
      setUploadState("");
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
  const activeAttachments = active ? data.attachments.filter((attachment) => attachment.ticket_id === active.id) : [];
  const initialAttachments = activeAttachments.filter((attachment) => !attachment.message_id);

  return <>
    <header className="page-head"><div><p className="eyebrow">Kundenbetrieb</p><h1>Support & SLA</h1><p>Supportfälle nach Priorität, Reaktionsziel und Abonnement bearbeiten.</p></div></header>
    <section className="stats support-stats">
      <article><span>Offen</span><strong>{openTickets.length}</strong><small>aktive Supportfälle</small></article>
      <article className={breached.length ? "danger" : ""}><span>SLA überfällig</span><strong>{breached.length}</strong><small>ohne erste Reaktion</small></article>
      <article><span>Kritisch</span><strong>{openTickets.filter((ticket) => ticket.priority === "critical").length}</strong><small>sofort prüfen</small></article>
      <article><span>Wartet auf Kunde</span><strong>{openTickets.filter((ticket) => ticket.status === "waiting_customer").length}</strong><small>Antwort ausstehend</small></article>
      <article className={openTickets.some((ticket) => ticket.ai_handling_status === "escalated") ? "danger" : ""}><span>KI eskaliert</span><strong>{openTickets.filter((ticket) => ticket.ai_handling_status === "escalated").length}</strong><small>persönliche Bearbeitung nötig</small></article>
    </section>

    <section className="panel support-ai-control-center">
      <div className="panel-head"><div><h3>KI-Support-Kontrollzentrum</h3><p>Arbeitsvorrat, Qualität und geschätzte API-Kosten an einem Ort.</p></div></div>
      {!data.controlCenterAvailable ? <p className="support-queue-empty">Führen Sie zuerst die Migration 20260918_support_ai_control_center.sql aus.</p> : <>
        <div className="support-ai-metrics">
          <article><span>Offene Tickets</span><strong>{openTickets.length}</strong><small>noch nicht abgeschlossen</small></article>
          <article className={interventionTickets.length ? "danger" : ""}><span>Admin erforderlich</span><strong>{interventionTickets.length}</strong><small>aktuell eskaliert</small></article>
          <article className={failedRuns.length ? "danger" : ""}><span>KI-Fehler</span><strong>{failedRuns.length}</strong><small>technisch fehlgeschlagen</small></article>
          <article><span>Tokenverbrauch</span><strong>{countLabel(totalTokens)}</strong><small>alle erfassten Läufe</small></article>
          <article><span>Kosten geschätzt</span><strong>{usdLabel(totalCost)}</strong><small>mit Preis-Snapshot</small></article>
          <article><span>Erfolgsquote</span><strong>{percentLabel(successfulRuns.length, finishedRuns.length)}</strong><small>Antwort oder Lösung</small></article>
          <article><span>Eskalationsquote</span><strong>{percentLabel(escalatedRuns.length, finishedRuns.length)}</strong><small>fachlich übergeben</small></article>
          <article><span>Kundenfeedback</span><strong>{helpfulFeedback.length} / {negativeFeedback.length}</strong><small>hilfreich / nicht hilfreich</small></article>
        </div>
        <div className="support-ai-action-grid">
          <section><header><div><h4>Jetzt persönlich eingreifen</h4><p>Aktuell eskalierte und noch offene Tickets.</p></div><b>{interventionTickets.length}</b></header><div>{interventionTickets.slice(0, 8).map((ticket) => <button type="button" key={ticket.id} onClick={() => openTicket(ticket)}><span><strong>{ticket.ticket_number} · {ticket.title}</strong><small>{relationName(ticket.tenant) || "Kundenportal"} · {ticket.ai_escalation_reason || "Persönliche Bearbeitung erforderlich"}</small></span><i>Öffnen →</i></button>)}{!interventionTickets.length && <p className="support-ai-empty">Keine eskalierten Tickets. Der KI-Erstsupport arbeitet innerhalb seiner Grenzen.</p>}</div></section>
          <section><header><div><h4>Fehlgeschlagene KI-Läufe</h4><p>Technische Fehler mit direktem Zugang zum Ticket.</p></div><b>{failedRuns.length}</b></header><div>{failedRuns.slice(0, 8).map((run) => { const ticket = data.tickets.find((entry) => entry.id === run.ticket_id); return <button type="button" key={run.id} disabled={!ticket} onClick={() => ticket && openTicket(ticket)}><span><strong>{ticket ? `${ticket.ticket_number} · ${ticket.title}` : "Gelöschtes Ticket"}</strong><small>{run.model || "Unbekanntes Modell"} · {run.error_message || run.escalation_reason || "Technischer Fehler"} · {dateTime(run.created_at)}</small></span><i>{ticket ? "Öffnen →" : "–"}</i></button>; })}{!failedRuns.length && <p className="support-ai-empty">Keine fehlgeschlagenen KI-Läufe.</p>}</div></section>
        </div>
        {negativeFeedback.length > 0 && <div className="support-ai-negative-feedback"><header><h4>Nicht hilfreiche Antworten prüfen</h4><span>{negativeFeedback.length}</span></header>{negativeFeedback.slice(0, 8).map((feedback) => { const message = data.messages.find((entry) => entry.id === feedback.message_id); const ticket = data.tickets.find((entry) => entry.id === message?.ticket_id); return <button type="button" key={feedback.id} disabled={!ticket} onClick={() => ticket && openTicket(ticket)}><span><b>{ticket?.ticket_number || "Ticket nicht verfügbar"}</b><small>{feedback.comment || "Der Kunde hat diese KI-Antwort als nicht hilfreich bewertet."}</small></span><i>{ticket ? "Antwort ansehen →" : "–"}</i></button>; })}</div>}
      </>}
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
      <div className="support-ops-description"><b>Kundenbeschreibung</b><p>{active.description}</p><AdminAttachments attachments={initialAttachments} onOpen={(attachment) => void openAttachment(attachment)}/><small>{categoryLabels[active.category]} · Paket {active.package_code_snapshot} · eingegangen {dateTime(active.created_at)}</small></div>
      {active.ai_handling_status && <div className={`support-ai-admin-state ${active.ai_handling_status}`}><b>{aiLabels[active.ai_handling_status]}</b>{active.ai_escalation_reason && <span>{active.ai_escalation_reason}</span>}<small>{active.ai_attempt_count || 0} KI-Versuche{active.ai_confidence != null ? ` · Sicherheit ${Math.round(Number(active.ai_confidence) * 100)} %` : ""}</small></div>}
      {active.status === "resolved" && <div className="support-lifecycle-note resolved"><b>✓ Lösung an den Kunden gesendet</b><span>Eine Kundenantwort öffnet den Fall automatisch wieder. Ohne Rückfrage kann er endgültig geschlossen werden.</span></div>}
      {active.status === "closed" && <div className="support-lifecycle-note closed"><b>Fall endgültig geschlossen</b><span>Der Kunde kann in diesem Ticket keine weiteren Nachrichten senden.</span></div>}
      {active.status === "cancelled" && <div className="support-lifecycle-note cancelled"><b>Fall abgebrochen</b><span>Dieser Fall kann nicht weiterbearbeitet werden.</span></div>}
      <div className="support-ops-conversation">{data.messages.filter((message) => message.ticket_id === active.id).map((message) => <article className={`${message.visible_to_customer ? message.author_type : "internal"}${message.generated_by_ai ? " ai" : ""}`} key={message.id}><header><b>{message.author_name}{message.generated_by_ai ? " · KI-Assistent" : !message.visible_to_customer ? " · interne Notiz" : ""}</b><time>{dateTime(message.created_at)}</time></header><p>{message.body}</p><AdminAttachments attachments={activeAttachments.filter((attachment) => attachment.message_id === message.id)} onOpen={(attachment) => void openAttachment(attachment)}/></article>)}</div>
      <form onSubmit={updateTicket}>
        {activeLifecycle && <input type="hidden" name="status" value={active.status}/>}<div className="form-row"><label>Status<select name={activeLifecycle ? undefined : "status"} defaultValue={active.status} disabled={activeLifecycle}>{lifecycleOptions.map((value) => <option value={value} key={value}>{statusLabels[value]}</option>)}</select></label><label>Priorität<select name="priority" defaultValue={active.priority}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
        <label>Zuständig<select name="assignedTo" defaultValue={active.assigned_to || ""}><option value="">Noch nicht zugewiesen</option>{profiles.map((entry) => <option value={entry.user_id} key={entry.user_id}>{entry.display_name}</option>)}</select></label>
        {!activeLifecycle && <label>Sichtbare Antwort an den Kunden<textarea name="publicResponse" rows={5} placeholder="Antwort, Rückfrage oder Lösung für das Kundenportal"/></label>}
        {!activeLifecycle && data.attachmentsAvailable && <fieldset className="support-admin-file-picker"><legend>Datei für den Kunden (optional)</legend><label className="support-admin-file-button">Screenshot oder PDF auswählen<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { try { setResponseFiles(selectedSupportFiles(responseFiles, event.target.files)); setError(""); } catch (reason) { setError((reason as Error).message); } event.target.value = ""; }}/></label><small>JPG, PNG, WebP oder PDF · höchstens 5 Dateien · je maximal 10 MB</small>{responseFiles.length > 0 && <div className="support-admin-pending-files">{responseFiles.map((file, index) => <span key={`${file.name}-${file.lastModified}-${index}`}><b>{file.name}</b><small>{fileSize(file.size)}</small><button type="button" aria-label={`${file.name} entfernen`} onClick={() => setResponseFiles((files) => files.filter((_, candidate) => candidate !== index))}>×</button></span>)}</div>}</fieldset>}
        {active.status !== "cancelled" && <label>Interne Notiz<textarea name="internalNote" rows={3} placeholder="Nur für SwissCompact sichtbar"/></label>}
        {uploadState && <p className="support-admin-upload-state" role="status">{uploadState}</p>}{error && <p className="form-error">{error}</p>}
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
