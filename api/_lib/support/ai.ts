type SupportAiResult = {
  handled: boolean;
  escalated: boolean;
  notifyAdmin: boolean;
  reason?: string;
};

type ModelDecision = {
  decision: "reply" | "resolve" | "escalate";
  confidence: number;
  message: string;
  escalation_reason: string;
  resolution_confirmed: boolean;
};

const MIN_CONFIDENCE = 0.78;
const MAX_AI_ATTEMPTS = 3;
const HUMAN_REQUEST = /\b(mensch|mitarbeiter|mitarbeiterin|admin|persönlich|person|telefon|anrufen|rückruf|support[ -]?team)\b/i;
const SOLVED_CONFIRMATION = /\b(funktioniert wieder|hat geklappt|problem (ist )?gelöst|ist behoben|alles (wieder )?gut|läuft wieder)\b/i;
const NEGATIVE_CONFIRMATION = /\b(nicht|kein|leider|immer noch|weiterhin)\b.{0,35}\b(funktioniert|geklappt|gelöst|behoben|gut|läuft)\b/i;

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function outputText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, any>;
  if (typeof record.output_text === "string") return record.output_text;
  for (const item of Array.isArray(record.output) ? record.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string") return content.text;
    }
  }
  return "";
}

function parseDecision(value: unknown): ModelDecision | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!new Set(["reply", "resolve", "escalate"]).has(String(record.decision))) return null;
  const confidence = Number(record.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  return {
    decision: record.decision as ModelDecision["decision"],
    confidence,
    message: boundedText(record.message, 8000),
    escalation_reason: boundedText(record.escalation_reason, 1000),
    resolution_confirmed: record.resolution_confirmed === true,
  };
}

async function audit(admin: any, ticket: any, action: string, metadata: Record<string, unknown>): Promise<void> {
  const result = await admin.from("tenant_audit_log").insert({
    tenant_id: ticket.tenant_id,
    actor_user_id: null,
    action,
    entity_type: "support_ticket",
    entity_id: ticket.id,
    metadata,
  });
  if (result.error) console.error("support-ai audit:", result.error.message);
}

async function escalate(
  admin: any,
  ticket: any,
  runId: string | null,
  reason: string,
  status: "escalated" | "failed" = "escalated",
  errorMessage?: string,
): Promise<SupportAiResult> {
  const now = new Date().toISOString();
  await admin.from("support_tickets").update({
    ai_handling_status: "escalated",
    ai_escalation_reason: reason,
    ai_escalated_at: now,
    updated_at: now,
  }).eq("id", ticket.id);
  if (runId) {
    await admin.from("support_ai_runs").update({
      status,
      decision: "escalate",
      escalation_reason: reason,
      error_message: errorMessage ? errorMessage.slice(0, 2000) : null,
      completed_at: now,
    }).eq("id", runId);
  }
  await audit(admin, ticket, "support_ai_escalated", { reason, runId, technicalFailure: status === "failed" });
  return { handled: false, escalated: true, notifyAdmin: true, reason };
}

function directEscalationReason(ticket: any, latestCustomerMessage: string): string | null {
  if (ticket.priority === "critical") return "Kritische Supportanfragen werden direkt durch das Supportteam bearbeitet.";
  if (ticket.category === "billing") return "Abonnement- und Rechnungsfragen werden direkt durch das Supportteam bearbeitet.";
  if (ticket.category === "feature") return "Funktionswünsche werden durch das Supportteam geprüft.";
  if (HUMAN_REQUEST.test(latestCustomerMessage)) return "Der Kunde wünscht ausdrücklich eine persönliche Bearbeitung.";
  if (Number(ticket.ai_attempt_count || 0) >= MAX_AI_ATTEMPTS) return "Der KI-Erstsupport hat die maximale Anzahl an Lösungsversuchen erreicht.";
  return null;
}

export async function processSupportWithAi(
  admin: any,
  ticketId: string,
  triggerMessageId: string | null = null,
  triggerOverride: string | null = null,
): Promise<SupportAiResult> {
  const ticketResult = await admin.from("support_tickets")
    .select("*,display:tenant_displays(name)")
    .eq("id", ticketId)
    .maybeSingle();
  const ticket = ticketResult.data;
  if (!ticket || ticketResult.error) return { handled: false, escalated: true, notifyAdmin: true, reason: "Supportfall konnte nicht geladen werden." };
  if (["closed", "cancelled"].includes(ticket.status)) return { handled: false, escalated: false, notifyAdmin: false };
  if (ticket.ai_handling_status === "disabled") return { handled: false, escalated: false, notifyAdmin: true, reason: "KI-Erstsupport ist für diesen Fall deaktiviert." };

  const triggerKey = triggerOverride || (triggerMessageId ? `message:${triggerMessageId}` : `ticket:${ticket.id}:created`);
  const runCreated = await admin.from("support_ai_runs").insert({
    ticket_id: ticket.id,
    trigger_key: triggerKey,
    trigger_message_id: triggerMessageId,
    status: "processing",
    model: process.env.OPENAI_SUPPORT_MODEL || process.env.OPENAI_ASSISTANT_MODEL || "gpt-5.6-terra",
    prompt_context: { category: ticket.category, priority: ticket.priority, attempt: Number(ticket.ai_attempt_count || 0) + 1 },
  }).select("id").maybeSingle();
  if (runCreated.error) {
    if (runCreated.error.code === "23505") return { handled: false, escalated: false, notifyAdmin: false };
    console.warn("support-ai migration unavailable:", runCreated.error.message);
    return { handled: false, escalated: true, notifyAdmin: true, reason: "KI-Erstsupport ist noch nicht vollständig eingerichtet." };
  }
  const runId = String(runCreated.data.id);

  const messagesResult = await admin.from("support_ticket_messages")
    .select("id,author_type,author_name,body,created_at,generated_by_ai")
    .eq("ticket_id", ticket.id)
    .eq("visible_to_customer", true)
    .order("created_at")
    .limit(30);
  const messages = messagesResult.data ?? [];
  const latestCustomerMessage = [...messages].reverse().find((entry: any) => entry.author_type === "customer")?.body || ticket.description;
  const directReason = directEscalationReason(ticket, latestCustomerMessage);
  if (directReason) return escalate(admin, ticket, runId, directReason);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return escalate(admin, ticket, runId, "Der KI-Dienst ist momentan nicht verfügbar.", "failed", "OPENAI_API_KEY fehlt");

  const knowledgeResult = await admin.from("support_ai_knowledge")
    .select("category,title,content,source_reference")
    .in("category", ["general", ticket.category])
    .eq("active", true)
    .not("approved_at", "is", null)
    .order("updated_at", { ascending: false })
    .limit(20);
  const knowledge = (knowledgeResult.data ?? []).map((entry: any) => `## ${entry.title}\n${entry.content}`).join("\n\n");
  const customerConfirmedSolved = SOLVED_CONFIRMATION.test(latestCustomerMessage) && !NEGATIVE_CONFIRMATION.test(latestCustomerMessage);
  const model = process.env.OPENAI_SUPPORT_MODEL || process.env.OPENAI_ASSISTANT_MODEL || "gpt-5.6-terra";
  const attempt = Number(ticket.ai_attempt_count || 0) + 1;
  const now = new Date().toISOString();
  await admin.from("support_tickets").update({ ai_handling_status: "processing", ai_attempt_count: attempt, updated_at: now }).eq("id", ticket.id);

  const conversation = [
    { role: "user", content: `Ursprüngliche Anfrage: ${ticket.title}\n\n${ticket.description}` },
    ...messages.map((entry: any) => ({
      role: entry.author_type === "customer" ? "user" : "assistant",
      content: `${entry.generated_by_ai ? "KI-Support" : entry.author_name}: ${entry.body}`,
    })),
  ];
  const instructions = `Du bist der klar gekennzeichnete KI-Supportassistent von SwissCompact. Antworte auf Deutsch (Schweizer Hochdeutsch), kurz, freundlich und konkret.

SICHERHEIT UND GRENZEN:
- Verwende ausschliesslich die freigegebene Wissensbasis und Angaben im Ticket. Erfinde keine Produkteigenschaften, Diagnosen oder ausgeführten Handlungen.
- Du hast nur Leserechte. Behaupte nie, Einstellungen, Konten, Abonnemente, Rechnungen, Daten, Kampagnen oder Displays geändert zu haben.
- Frage nie nach Passwörtern, API-Schlüsseln, vollständigen Zahlungsdaten oder anderen Geheimnissen.
- Weise nie zum Öffnen elektrischer Geräte, Umgehen von Schutzmechanismen oder zu gefährlichen Arbeiten an.
- Bei Unsicherheit, Sicherheits-/Datenschutzthemen, möglichem Datenverlust, widersprüchlichen Angaben oder notwendigem Systemeingriff: eskalieren.
- Stelle höchstens zwei präzise Rückfragen oder gib höchstens vier nummerierte, risikoarme Schritte.
- Markiere nur dann als gelöst, wenn der Kunde im letzten Beitrag ausdrücklich bestätigt hat, dass das Problem behoben ist.

TICKETKONTEXT:
Kategorie: ${ticket.category}
Priorität: ${ticket.priority}
Betroffener Bildschirm: ${Array.isArray(ticket.display) ? ticket.display[0]?.name || "nicht angegeben" : ticket.display?.name || "nicht angegeben"}
KI-Versuch: ${attempt} von ${MAX_AI_ATTEMPTS}
Explizite Lösungsbestätigung erkannt: ${customerConfirmedSolved ? "ja" : "nein"}

FREIGEGEBENE WISSENSBASIS:
${knowledge || "Für dieses Thema ist noch kein freigegebener Wissenseintrag vorhanden. Stelle nur sichere Klärungsfragen oder eskaliere."}`;

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions,
        input: conversation,
        max_output_tokens: 900,
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: "support_ai_decision",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                decision: { type: "string", enum: ["reply", "resolve", "escalate"] },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                message: { type: "string" },
                escalation_reason: { type: "string" },
                resolution_confirmed: { type: "boolean" },
              },
              required: ["decision", "confidence", "message", "escalation_reason", "resolution_confirmed"],
            },
          },
        },
        store: false,
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "OpenAI-Anfrage fehlgeschlagen";
    return escalate(admin, ticket, runId, "Der KI-Erstsupport war technisch nicht erreichbar.", "failed", message);
  }

  if (!response.ok) {
    const errorMessage = await response.text().catch(() => `HTTP ${response.status}`);
    return escalate(admin, ticket, runId, "Der KI-Erstsupport konnte keine zuverlässige Antwort erstellen.", "failed", errorMessage);
  }

  const payload = await response.json().catch(() => null) as any;
  let parsed: ModelDecision | null = null;
  try { parsed = parseDecision(JSON.parse(outputText(payload))); } catch { parsed = null; }
  if (!parsed) return escalate(admin, ticket, runId, "Die KI-Antwort konnte nicht sicher ausgewertet werden.", "failed", "Ungültige strukturierte Antwort");
  if (parsed.decision === "escalate" || parsed.confidence < MIN_CONFIDENCE || !parsed.message) {
    const reason = parsed.escalation_reason || (parsed.confidence < MIN_CONFIDENCE ? "Die Antwortsicherheit des KI-Erstsupports ist zu niedrig." : "Der KI-Erstsupport benötigt persönliche Unterstützung.");
    await admin.from("support_ai_runs").update({ confidence: parsed.confidence, openai_response_id: payload?.id || null }).eq("id", runId);
    return escalate(admin, ticket, runId, reason);
  }

  const resolved = parsed.decision === "resolve" && parsed.resolution_confirmed && customerConfirmedSolved && parsed.confidence >= 0.9;
  const inserted = await admin.from("support_ticket_messages").insert({
    ticket_id: ticket.id,
    tenant_id: ticket.tenant_id,
    author_user_id: null,
    author_type: "support",
    author_name: "SwissCompact KI-Support",
    body: parsed.message,
    visible_to_customer: true,
    generated_by_ai: true,
    ai_run_id: runId,
  });
  if (inserted.error) return escalate(admin, ticket, runId, "Die KI-Antwort konnte nicht sicher gespeichert werden.", "failed", inserted.error.message);

  const completedAt = new Date().toISOString();
  await admin.from("support_tickets").update({
    status: resolved ? "resolved" : "waiting_customer",
    resolved_at: resolved ? completedAt : null,
    first_responded_at: ticket.first_responded_at || completedAt,
    ai_handling_status: resolved ? "resolved" : "waiting_customer",
    ai_confidence: parsed.confidence,
    ai_escalation_reason: null,
    ai_escalated_at: null,
    ai_last_responded_at: completedAt,
    updated_at: completedAt,
  }).eq("id", ticket.id);
  await admin.from("support_ai_runs").update({
    status: resolved ? "resolved" : "responded",
    decision: resolved ? "resolve" : "reply",
    confidence: parsed.confidence,
    openai_response_id: payload?.id || null,
    usage_metadata: payload?.usage || {},
    completed_at: completedAt,
  }).eq("id", runId);
  await audit(admin, ticket, resolved ? "support_ai_resolved" : "support_ai_responded", { runId, confidence: parsed.confidence, attempt });
  return { handled: true, escalated: false, notifyAdmin: false };
}
