import { loadPartnerNetwork } from "./partner-network.js";

type PortalNotificationProfile = {
  userId: string;
  tenantId: string;
  clientId: string;
};

export type PortalNotificationSnapshot = {
  available: boolean;
  unreadBySection: Record<string, number>;
};

/**
 * Loads only the records needed by the navigation badges. This keeps the
 * counters fresh without repeatedly rebuilding the complete portal overview.
 */
export async function loadPortalNotificationSnapshot(
  client: any,
  admin: any,
  profile: PortalNotificationProfile,
): Promise<PortalNotificationSnapshot> {
  const { userId, tenantId, clientId } = profile;
  const [
    cursors,
    displayAlerts,
    projectMessages,
    projectVersions,
    supportMessages,
    legalDocuments,
    legalAcceptances,
    dataRightsRequests,
    quotes,
    projects,
    invoices,
    partnerNetwork,
  ] = await Promise.all([
    client.from("notification_read_cursors")
      .select("section,last_read_at")
      .eq("user_id", userId)
      .eq("audience", "portal")
      .eq("scope_key", tenantId),
    client.from("tenant_display_alerts")
      .select("status,last_seen_at")
      .eq("tenant_id", tenantId)
      .neq("status", "resolved")
      .limit(200),
    admin.from("project_messages")
      .select("author_type,created_at")
      .eq("client_id", clientId)
      .eq("tenant_id", tenantId)
      .eq("visible_to_customer", true)
      .limit(500),
    admin.from("project_deliverable_versions")
      .select("submitted_by_type,created_at")
      .eq("client_id", clientId)
      .eq("tenant_id", tenantId)
      .eq("upload_state", "ready")
      .limit(500),
    client.from("support_ticket_messages")
      .select("author_type,created_at")
      .eq("tenant_id", tenantId)
      .eq("visible_to_customer", true)
      .limit(2000),
    client.from("legal_documents")
      .select("id,acceptance_scope,requires_acceptance,status,published_at")
      .eq("status", "published")
      .lte("effective_at", new Date().toISOString()),
    client.from("legal_acceptances")
      .select("document_id,user_id,acceptance_scope_snapshot")
      .eq("tenant_id", tenantId)
      .limit(500),
    client.from("tenant_data_rights_requests")
      .select("created_at,updated_at")
      .eq("tenant_id", tenantId)
      .limit(100),
    admin.from("quotes")
      .select("updated_at")
      .eq("client_id", clientId)
      .in("status", ["sent", "viewed", "accepted", "declined", "expired"])
      .limit(100),
    admin.from("projects")
      .select("updated_at")
      .eq("client_id", clientId)
      .eq("tenant_id", tenantId)
      .limit(100),
    admin.from("invoices")
      .select("updated_at")
      .eq("client_id", clientId)
      .limit(150),
    loadPartnerNetwork(admin, tenantId),
  ]);

  if (cursors.error) {
    console.warn("portal notification read cursors are unavailable", cursors.error.message);
    return { available: false, unreadBySection: {} };
  }

  const readTimes = new Map<string, number>(
    (cursors.data ?? []).map((entry: any): [string, number] => [entry.section, new Date(entry.last_read_at).getTime()]),
  );
  const unreadAfter = (section: string, value: unknown) => {
    const timestamp = value ? new Date(String(value)).getTime() : 0;
    return Number.isFinite(timestamp) && timestamp > (readTimes.get(section) ?? 0);
  };
  const acceptedDocumentIds = new Set(
    (legalAcceptances.data ?? [])
      .filter((entry: any) => entry.acceptance_scope_snapshot === "tenant" || entry.user_id === userId)
      .map((entry: any) => entry.document_id),
  );

  const recordEvents = [
    ...(projectMessages.data ?? [])
      .filter((entry: any) => entry.author_type !== "customer")
      .map((entry: any) => entry.created_at),
    ...(projectVersions.data ?? [])
      .filter((entry: any) => entry.submitted_by_type === "swisscompact")
      .map((entry: any) => entry.created_at),
    ...(quotes.data ?? []).map((entry: any) => entry.updated_at),
    ...(projects.data ?? []).map((entry: any) => entry.updated_at),
    ...(invoices.data ?? []).map((entry: any) => entry.updated_at),
  ];

  return {
    available: true,
    unreadBySection: {
      status: (displayAlerts.data ?? [])
        .filter((entry: any) => entry.status !== "resolved" && unreadAfter("status", entry.last_seen_at)).length,
      records: recordEvents.filter((timestamp) => unreadAfter("records", timestamp)).length,
      partners: [
        ...(partnerNetwork.partnerships ?? [])
          .filter((entry: any) => entry.direction === "incoming" && entry.status === "pending" && unreadAfter("partners", entry.created_at)),
        ...(partnerNetwork.offers ?? [])
          .filter((entry: any) => entry.direction === "incoming" && entry.status === "pending" && unreadAfter("partners", entry.created_at)),
      ].length,
      support: (supportMessages.data ?? [])
        .filter((entry: any) => entry.author_type !== "customer" && unreadAfter("support", entry.created_at)).length,
      settings: (legalDocuments.data ?? [])
        .filter((entry: any) => entry.requires_acceptance && !acceptedDocumentIds.has(entry.id) && unreadAfter("settings", entry.published_at)).length
        + (dataRightsRequests.data ?? [])
          .filter((entry: any) => entry.updated_at !== entry.created_at && unreadAfter("settings", entry.updated_at)).length,
    },
  };
}
