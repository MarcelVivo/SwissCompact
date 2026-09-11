import { Resend } from "resend";

const DEFAULT_ALERT_EMAIL = "kontakt@swisscompact.com";

function alertEmails(): string[] {
  return (process.env.OPERATIONS_ALERT_EMAIL || DEFAULT_ALERT_EMAIL)
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry, index, values) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry) && values.indexOf(entry) === index)
    .slice(0, 5);
}

function webhookUrl(): string | null {
  const value = process.env.OPERATIONS_ALERT_WEBHOOK_URL?.trim();
  if (!value) return null;
  try { return new URL(value).protocol === "https:" ? value : null; }
  catch { return null; }
}

function safeMessage(value: string): string {
  return value
    .replace(/(bearer|token|secret|password|api[-_ ]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 1200);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}

export function operationalAlertConfiguration() {
  const emails = alertEmails();
  return {
    emailConfigured: Boolean(process.env.RESEND_API_KEY && emails.length),
    emailRecipientHint: emails.length ? `${emails[0].slice(0, 2)}***@${emails[0].split("@")[1]}` : null,
    webhookConfigured: Boolean(webhookUrl()),
    cooldownMinutes: Math.max(1, Math.min(1440, Number(process.env.OPERATIONS_ALERT_COOLDOWN_MINUTES) || 15)),
  };
}

async function forwardCriticalIncident(client: any, incidentId: string, values: {
  key: string; tenantId?: string | null; source: string; kind: string; title: string; message?: string;
}): Promise<void> {
  const configuration = operationalAlertConfiguration();
  const claimed = await client.rpc("claim_operational_incident_alert", {
    target_incident: incidentId,
    target_cooldown_minutes: configuration.cooldownMinutes,
  });
  if (claimed.error || claimed.data !== true) {
    if (claimed.error && !/claim_operational_incident_alert/i.test(claimed.error.message)) console.error("critical alert claim:", claimed.error.message);
    return;
  }

  const cleanMessage = safeMessage(values.message || "Keine zusätzlichen technischen Angaben.");
  const dashboardUrl = `${(process.env.SITE_URL || "https://www.swisscompact.com").replace(/\/$/, "")}/dashboard`;
  const outcomes: Array<{ channel: "email" | "webhook"; delivered: boolean; error?: string }> = [];

  if (configuration.emailConfigured) {
    try {
      const response = await new Resend(process.env.RESEND_API_KEY!).emails.send({
        from: "SwissCompact Betrieb <kontakt@swisscompact.com>",
        to: alertEmails(),
        subject: `KRITISCH · ${values.title}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#18181b"><p style="color:#c8102e;font-weight:800;letter-spacing:.12em">SWISSCOMPACT BETRIEBSALARM</p><h1>${escapeHtml(values.title)}</h1><p><strong>Quelle:</strong> ${escapeHtml(values.source)} · ${escapeHtml(values.kind)}<br><strong>Schlüssel:</strong> ${escapeHtml(values.key)}</p><p>${escapeHtml(cleanMessage)}</p><p style="margin:28px 0"><a href="${escapeHtml(dashboardUrl)}" style="padding:13px 20px;background:#18181b;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Betriebscenter öffnen</a></p><small>Wiederholungen desselben Alarms werden während der Sperrzeit zusammengefasst.</small></div>`,
      });
      const error = response.error?.message;
      outcomes.push({ channel: "email", delivered: !error, error });
      await recordOperationalDelivery(client, { tenantId: values.tenantId, channel: "email", eventType: "critical_incident_alert", entityType: "operational_incident", entityId: incidentId, recipient: alertEmails().join(","), providerReference: response.data?.id || null, status: error ? "failed" : "delivered", error: error || null });
    } catch (reason) {
      const error = reason instanceof Error ? reason.message : "Alarm-E-Mail fehlgeschlagen";
      outcomes.push({ channel: "email", delivered: false, error });
      await recordOperationalDelivery(client, { tenantId: values.tenantId, channel: "email", eventType: "critical_incident_alert", entityType: "operational_incident", entityId: incidentId, recipient: alertEmails().join(","), status: "failed", error });
    }
  }

  const targetWebhook = webhookUrl();
  if (targetWebhook) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      const response = await fetch(targetWebhook, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.OPERATIONS_ALERT_WEBHOOK_BEARER ? { authorization: `Bearer ${process.env.OPERATIONS_ALERT_WEBHOOK_BEARER}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          text: `KRITISCH · ${values.title}\n${values.source} · ${values.kind}\n${cleanMessage}\n${dashboardUrl}`,
          severity: "critical", incidentId, incidentKey: values.key, source: values.source,
          kind: values.kind, title: values.title, message: cleanMessage, dashboardUrl,
        }),
      }).finally(() => clearTimeout(timeout));
      const error = response.ok ? undefined : `Webhook antwortete mit HTTP ${response.status}`;
      outcomes.push({ channel: "webhook", delivered: response.ok, error });
      await recordOperationalDelivery(client, { tenantId: values.tenantId, channel: "webhook", eventType: "critical_incident_alert", entityType: "operational_incident", entityId: incidentId, providerReference: response.headers.get("x-request-id"), status: response.ok ? "delivered" : "failed", error: error || null });
    } catch (reason) {
      const error = reason instanceof Error ? reason.message : "Alarm-Webhook fehlgeschlagen";
      outcomes.push({ channel: "webhook", delivered: false, error });
      await recordOperationalDelivery(client, { tenantId: values.tenantId, channel: "webhook", eventType: "critical_incident_alert", entityType: "operational_incident", entityId: incidentId, status: "failed", error });
    }
  }

  const delivered = outcomes.filter((entry) => entry.delivered).length;
  const status = outcomes.length === 0 ? "not_configured" : delivered === outcomes.length ? "delivered" : delivered > 0 ? "partial" : "failed";
  const errors = outcomes.filter((entry) => entry.error).map((entry) => `${entry.channel}: ${entry.error}`).join("; ").slice(0, 2000) || null;
  await client.from("operational_incidents").update({
    external_alert_status: status,
    external_alert_delivered_at: delivered > 0 ? new Date().toISOString() : null,
    external_alert_error: errors,
    updated_at: new Date().toISOString(),
  }).eq("id", incidentId);
}

export function recipientHint(value: string): string {
  const [name, domain] = value.trim().toLowerCase().split("@");
  if (!name || !domain) return "intern";
  return `${name.slice(0, 2)}***@${domain}`.slice(0, 180);
}

export async function recordOperationalDelivery(client: any, values: {
  tenantId?: string | null;
  channel: "email" | "webhook" | "export" | "media";
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  recipient?: string | null;
  providerReference?: string | null;
  status: "pending" | "delivered" | "failed" | "cancelled";
  error?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const result = await client.from("operational_delivery_attempts").insert({
    tenant_id: values.tenantId || null,
    channel: values.channel,
    event_type: values.eventType.slice(0, 120),
    entity_type: values.entityType || null,
    entity_id: values.entityId || null,
    recipient_hint: values.recipient ? recipientHint(values.recipient) : null,
    provider_reference: values.providerReference || null,
    status: values.status,
    error_message: values.error?.slice(0, 2000) || null,
    metadata: values.metadata || {},
    completed_at: ["delivered", "failed", "cancelled"].includes(values.status) ? new Date().toISOString() : null,
  });
  if (result.error && !/operational_delivery_attempts/i.test(result.error.message)) console.error("operational delivery:", result.error.message);
}

export async function reportOperationalIncident(client: any, values: {
  key: string;
  tenantId?: string | null;
  source: "application" | "auth" | "email" | "mux" | "stripe" | "storage" | "database" | "display" | "backup";
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message?: string;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  const result = await client.rpc("report_operational_incident", {
    target_key: values.key.slice(0, 240), target_tenant: values.tenantId || null,
    target_source: values.source, target_kind: values.kind, target_severity: values.severity,
    target_title: values.title.slice(0, 240), target_message: (values.message || "").slice(0, 4000),
    target_metadata: values.metadata || {},
  });
  if (result.error && !/report_operational_incident/i.test(result.error.message)) console.error("operational incident:", result.error.message);
  const incidentId = typeof result.data === "string" ? result.data : null;
  if (incidentId && values.severity === "critical") await forwardCriticalIncident(client, incidentId, values);
  return incidentId;
}
