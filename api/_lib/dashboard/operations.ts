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
}): Promise<void> {
  const result = await client.rpc("report_operational_incident", {
    target_key: values.key.slice(0, 240), target_tenant: values.tenantId || null,
    target_source: values.source, target_kind: values.kind, target_severity: values.severity,
    target_title: values.title.slice(0, 240), target_message: (values.message || "").slice(0, 4000),
    target_metadata: values.metadata || {},
  });
  if (result.error && !/report_operational_incident/i.test(result.error.message)) console.error("operational incident:", result.error.message);
}
