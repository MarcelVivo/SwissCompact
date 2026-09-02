import { authorizeDashboard, authorizePortal, dashboardSupabase, isResponse } from "../_lib/dashboard/auth.js";
import { json } from "../_lib/assistant/security.js";
import { publicAiConfiguration } from "../_lib/portal/ai-config.js";
import { muxSignedPlaybackUrl, muxVideoEnabled } from "../_lib/portal/mux-video.js";
import { loadPartnerNetwork } from "../_lib/portal/partner-network.js";
import { loadPortalNotificationSnapshot } from "../_lib/portal/notifications.js";

export const config = { runtime: "nodejs", maxDuration: 15 };

export async function GET(request: Request): Promise<Response> {
  const snapshotAt = new Date().toISOString();
  if (new URL(request.url).searchParams.get("audience") === "portal") {
    const authorized = await authorizePortal(request);
    if (isResponse(authorized)) return authorized;
    const { client, profile } = authorized;
    const tenantId = profile.tenantId;
    const customerAdmin = dashboardSupabase();
    if (!customerAdmin) return json({ error: "Kundenvorgänge sind noch nicht konfiguriert" }, { status: 503 });
    if (new URL(request.url).searchParams.get("notificationsOnly") === "1") {
      const notifications = await loadPortalNotificationSnapshot(client, customerAdmin, profile);
      return json({ notifications, generatedAt: snapshotAt });
    }
    const partnerNetworkPromise = loadPartnerNetwork(customerAdmin, tenantId);
    const displayHealthRefresh = await client.rpc("refresh_display_delivery_health", { target_tenant: tenantId });
    if (displayHealthRefresh.error) console.warn("portal display health refresh:", displayHealthRefresh.error.message);
    const [sites, areas, displays, content, campaigns, targetContent, subscription, members, creatorEvents, aiBalance, displayDeliveryState, campaignPriorities, displayVersions, displayTests, displayAlerts, campaignTemplates, displayGroups, displayGroupMembers, campaignVersions, legalDocuments, legalAcceptances, dataRightsRequests, supportPolicies, supportTickets, supportMessages, supportFeedback, supportAttachments] = await Promise.all([
      client.from("tenant_sites").select("id,name,address,timezone,active,created_at,updated_at").eq("tenant_id", tenantId).order("name"),
      client.from("tenant_areas").select("id,site_id,parent_id,name,kind,active,created_at,updated_at").eq("tenant_id", tenantId).order("name"),
      client.from("tenant_displays").select("id,site_id,area_id,name,kind,status,orientation,resolution,screen_size_inches,panel_technology,use_category,last_seen_at,configuration_version,created_at,updated_at,site:tenant_sites(name),area:tenant_areas(id,name,kind,parent_id)").eq("tenant_id", tenantId).order("updated_at", { ascending: false }),
      client.from("tenant_content").select("id,title,content_type,status,payload,asset_path,created_by,created_at,updated_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(100),
      client.from("tenant_campaigns").select("id,name,theme,status,starts_at,ends_at,schedule,scope_site_id,scope_area_id,created_by,created_at,updated_at,content_links:tenant_campaign_content(position,duration_seconds,content:tenant_content(id,title,content_type,status,preview_path:asset_path)),display_links:tenant_campaign_displays(display_id,display:tenant_displays(id,name,status,site:tenant_sites(name),area:tenant_areas(id,name,kind)))").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(100),
      client.from("tenant_campaign_display_content").select("campaign_id,display_id,position,duration_seconds,content:tenant_content(id,title,content_type,status)").eq("tenant_id", tenantId).order("position"),
      client.from("tenant_subscriptions").select("package_code,status,starts_on,minimum_ends_on,monthly_amount_chf,included_ai_credits").eq("tenant_id", tenantId).in("status", ["trial","active","past_due","paused"]).maybeSingle(),
      client.from("tenant_memberships").select("id,role,display_name,user_id,active,access_status,invited_at,accepted_at,verified_at").eq("tenant_id", tenantId),
      client.from("tenant_audit_log").select("entity_type,entity_id,actor_user_id,created_at").eq("tenant_id", tenantId).eq("action", "create").in("entity_type", ["display", "content", "campaign"]).order("created_at", { ascending: true }),
      client.rpc("get_ai_credit_balance", { target_tenant: tenantId }),
      client.from("tenant_displays").select("id,last_acknowledged_version,last_delivery_at,delivery_status,last_delivery_error,fallback_content_id").eq("tenant_id", tenantId),
      client.from("tenant_campaigns").select("id,priority").eq("tenant_id", tenantId),
      client.from("tenant_display_config_versions").select("id,display_id,version,source,campaign_id,state,previous_version,created_at").eq("tenant_id", tenantId).order("version", { ascending: false }).limit(500),
      client.from("tenant_display_test_publications").select("id,display_id,campaign_id,configuration_version,previous_version,status,expires_at,created_at").eq("tenant_id", tenantId).eq("status", "active").limit(100),
      client.from("tenant_display_alerts").select("id,display_id,kind,severity,status,message,metadata,first_seen_at,last_seen_at,resolved_at").eq("tenant_id", tenantId).neq("status", "resolved").order("last_seen_at", { ascending: false }).limit(200),
      client.from("tenant_campaign_templates").select("id,name,description,template_kind,configuration,source_campaign_id,created_at,updated_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(100),
      client.from("tenant_display_groups").select("id,name,description,created_at,updated_at").eq("tenant_id", tenantId).order("name").limit(250),
      client.from("tenant_display_group_members").select("group_id,display_id").eq("tenant_id", tenantId).limit(5000),
      client.from("tenant_campaign_versions").select("id,campaign_id,version,source,configuration,restored_from_version_id,created_by,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(500),
      client.from("legal_documents").select("id,document_type,acceptance_scope,version,title,summary,content_markdown,content_hash,requires_acceptance,status,effective_at,published_at").in("status", ["published", "superseded"]).lte("effective_at", new Date().toISOString()).order("published_at", { ascending: false }),
      client.from("legal_acceptances").select("id,document_id,user_id,acceptance_scope_snapshot,accepted_at,membership:tenant_memberships(display_name)").eq("tenant_id", tenantId).order("accepted_at", { ascending: false }).limit(500),
      client.from("tenant_data_rights_requests").select("id,request_type,status,reason,export_expires_at,review_note,reviewed_at,completed_at,cancelled_at,created_at,updated_at,requested_by").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
      client.from("support_sla_policies").select("package_code,support_label,coverage_description,critical_coverage,business_timezone,business_start,business_end,critical_response_minutes,high_response_minutes,normal_response_minutes,low_response_minutes,response_target_note").eq("active", true),
      client.from("support_tickets").select("id,ticket_number,requested_by,affected_display_id,category,priority,status,title,description,package_code_snapshot,support_label_snapshot,coverage_snapshot,response_target_minutes,first_response_due_at,first_responded_at,resolved_at,closed_at,created_at,updated_at,ai_handling_status,ai_attempt_count,ai_confidence,ai_escalation_reason,ai_last_responded_at,ai_escalated_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200),
      client.from("support_ticket_messages").select("id,ticket_id,author_type,author_name,body,created_at,generated_by_ai").eq("tenant_id", tenantId).eq("visible_to_customer", true).order("created_at").limit(2000),
      client.from("support_ai_feedback").select("id,message_id,rating,comment,created_at,updated_at").eq("tenant_id", tenantId).eq("submitted_by", profile.userId).limit(2000),
      client.from("support_ticket_attachments").select("id,ticket_id,message_id,uploaded_by_type,file_name,mime_type,size_bytes,upload_status,ai_analysis_allowed,ready_at,created_at").eq("tenant_id", tenantId).eq("visible_to_customer", true).eq("upload_status", "ready").order("created_at").limit(2000),
    ]);
    const [customerQuotes, customerProjects, customerInvoices, responsibleProfiles] = await Promise.all([
      customerAdmin.from("quotes").select("id,quote_number,opportunity_id,status,currency,total,valid_until,items,terms,document_hash,accepted_by_name,accepted_at,created_at,updated_at,opportunity:opportunities(title)").eq("client_id", profile.clientId).in("status", ["sent", "viewed", "accepted", "declined", "expired"]).order("updated_at", { ascending: false }).limit(100),
      customerAdmin.from("projects").select("id,quote_id,opportunity_id,order_number,title,status,software_owner,hardware_owner,starts_on,target_completion,deposit_received,installation_payment_received,final_payment_received,created_at,updated_at").eq("client_id", profile.clientId).order("updated_at", { ascending: false }).limit(100),
      customerAdmin.from("invoices").select("id,quote_id,project_id,invoice_number,installment,status,amount,currency,issued_on,due_on,paid_at,immutable_pdf_path,created_at,updated_at,project:projects(order_number,title)").eq("client_id", profile.clientId).order("created_at", { ascending: false }).limit(150),
      customerAdmin.from("dashboard_profiles").select("user_id,display_name,email").eq("active", true),
    ]);
    const [projectBriefings, projectMessages, projectDeliverables, projectVersions, projectReviews, projectRevisions] = await Promise.all([
      customerAdmin.from("projects").select("id,briefing").eq("client_id", profile.clientId).eq("tenant_id", tenantId).limit(100),
      customerAdmin.from("project_messages").select("id,project_id,author_type,author_name,body,created_at").eq("client_id", profile.clientId).eq("tenant_id", tenantId).eq("visible_to_customer", true).order("created_at").limit(500),
      customerAdmin.from("project_deliverables").select("id,project_id,title,kind,status,current_version,created_at,updated_at").eq("client_id", profile.clientId).eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(300),
      customerAdmin.from("project_deliverable_versions").select("id,deliverable_id,project_id,version,file_name,mime_type,size_bytes,notes,upload_state,submitted_by_type,created_at").eq("client_id", profile.clientId).eq("tenant_id", tenantId).eq("upload_state", "ready").order("version", { ascending: false }).limit(500),
      customerAdmin.from("project_review_decisions").select("id,deliverable_version_id,project_id,decision,feedback,decided_by_name,created_at").eq("client_id", profile.clientId).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(300),
      customerAdmin.from("project_revision_rounds").select("id,project_id,deliverable_id,round_number,status,request_text,response_text,included,additional_cost_chf,approved_at,created_at,updated_at").eq("client_id", profile.clientId).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(300),
    ]);
    const partnerNetwork = await partnerNetworkPromise;
    const notificationCursors = await client.from("notification_read_cursors")
      .select("section,last_read_at")
      .eq("user_id", profile.userId)
      .eq("audience", "portal")
      .eq("scope_key", tenantId);
    const portalDataQueries = { sites, areas, displays, content, campaigns, targetContent, subscription, members, creatorEvents };
    const portalDataErrors = Object.entries(portalDataQueries)
      .filter(([, result]) => result.error)
      .map(([query, result]) => ({ query, message: result.error?.message }));
    // Eine optionale Portalansicht darf eine gültige Kundensitzung nie wieder
    // auf den Anmeldebildschirm zurückwerfen. Fehlerhafte Bereiche bleiben leer
    // und werden serverseitig mit ihrem Abfragenamen protokolliert.
    if (portalDataErrors.length) console.error("portal overview partial data:", portalDataErrors);
    const displaySafetyAvailable = [displayVersions, displayTests, displayAlerts].every((result) => !result.error);
    if (!displaySafetyAvailable) console.warn("portal display safety is temporarily unavailable", {
      versions: displayVersions.error?.message,
      tests: displayTests.error?.message,
      alerts: displayAlerts.error?.message,
    });
    if (displayDeliveryState.error || campaignPriorities.error) console.warn("portal display delivery metadata is temporarily unavailable", {
      displays: displayDeliveryState.error?.message,
      campaigns: campaignPriorities.error?.message,
    });
    if (campaignTemplates.error) console.warn("portal campaign templates are not migrated yet", campaignTemplates.error.message);
    const displayGroupsAvailable = !displayGroups.error && !displayGroupMembers.error;
    if (!displayGroupsAvailable) console.warn("portal display groups are not migrated yet", displayGroups.error?.message || displayGroupMembers.error?.message);
    const campaignVersionsAvailable = !campaignVersions.error;
    if (!campaignVersionsAvailable) console.warn("portal campaign versions are not migrated yet", campaignVersions.error?.message);
    const legalComplianceAvailable = !legalDocuments.error && !legalAcceptances.error;
    if (!legalComplianceAvailable) console.warn("portal legal compliance is not migrated yet", legalDocuments.error?.message || legalAcceptances.error?.message);
    const dataRightsAvailable = !dataRightsRequests.error;
    if (!dataRightsAvailable) console.warn("portal data rights are not migrated yet", dataRightsRequests.error?.message);
    const notificationsAvailable = !notificationCursors.error;
    if (!notificationsAvailable) console.warn("portal notification read cursors are not migrated yet", notificationCursors.error?.message);
    const supportAvailable = !supportPolicies.error && !supportTickets.error && !supportMessages.error;
    const supportFeedbackAvailable = !supportFeedback.error;
    const supportAttachmentsAvailable = !supportAttachments.error;
    if (!supportAvailable) console.warn("portal support SLA is not migrated yet", supportPolicies.error?.message || supportTickets.error?.message || supportMessages.error?.message);
    const customerRecordsError = [customerQuotes, customerProjects, customerInvoices, responsibleProfiles].find((result) => result.error)?.error;
    if (customerRecordsError) {
      console.error("portal customer records:", customerRecordsError.message);
      return json({ error: "Ihre Vorgänge konnten nicht sicher geladen werden" }, { status: 503 });
    }
    const collaborationResults = [projectBriefings, projectMessages, projectDeliverables, projectVersions, projectReviews, projectRevisions];
    const collaborationAvailable = collaborationResults.every((result) => !result.error);
    if (!collaborationAvailable) console.warn("portal project collaboration is not migrated yet");
    const creatorNames = new Map((members.data ?? []).map((member) => [member.user_id, member.display_name || "Portalbenutzer"]));
    const auditedCreators = new Map<string, string>();
    for (const event of creatorEvents.data ?? []) {
      const key = `${event.entity_type}:${event.entity_id}`;
      if (event.actor_user_id && !auditedCreators.has(key)) auditedCreators.set(key, event.actor_user_id);
    }
    const creatorName = (userId?: string | null) => userId ? creatorNames.get(userId) || "Ehemaliger Benutzer" : "Nicht erfasst";
    const portalReadTimes = new Map((notificationCursors.data ?? []).map((entry: any) => [entry.section, new Date(entry.last_read_at).getTime()]));
    const unreadAfter = (section: string, value: unknown) => {
      const timestamp = value ? new Date(String(value)).getTime() : 0;
      return Number.isFinite(timestamp) && timestamp > (portalReadTimes.get(section) ?? 0);
    };
    const contentWithPreviews = await Promise.all((content.data ?? []).map(async (item) => {
      const enriched = { ...item, creator_name: creatorName(item.created_by || auditedCreators.get(`content:${item.id}`)) };
      const posterPath = typeof item.payload?.posterPath === "string" ? item.payload.posterPath : "";
      const poster = posterPath ? await client.storage.from("swisscompact-media").createSignedUrl(posterPath, 60 * 60) : null;
      const ready = item.payload?.uploadState === "ready" && (!item.payload?.processingState || item.payload.processingState === "ready");
      const muxVideo = item.payload?.mediaProvider === "mux";
      const muxPlaybackId = typeof item.payload?.mux?.playbackId === "string" ? item.payload.mux.playbackId.trim() : "";
      const muxRenditionName = typeof item.payload?.mux?.renditionName === "string" ? item.payload.mux.renditionName.trim() : "highest.mp4";
      let muxPreviewUrl: string | null = null;
      if (ready && muxVideo && muxPlaybackId) {
        try { muxPreviewUrl = muxSignedPlaybackUrl(muxPlaybackId, muxRenditionName || "highest.mp4", 60 * 60); }
        catch (reason) { console.error("portal Mux preview URL failed", reason); }
      }
      const storagePreview = ready && item.asset_path && !muxVideo
        ? await client.storage.from("swisscompact-media").createSignedUrl(item.asset_path, 60 * 60)
        : null;
      return { ...enriched, preview_url: muxPreviewUrl ?? storagePreview?.data?.signedUrl ?? null, poster_url: poster?.data?.signedUrl ?? null };
    }));
    const displayHealthCutoff = Date.now() - 90_000;
    const deliveryStateByDisplay = new Map((displayDeliveryState.data ?? []).map((entry) => [entry.id, entry]));
    const displaysWithHealth = (displays.data ?? []).map((display) => ({
      ...display,
      ...(deliveryStateByDisplay.get(display.id) ?? {}),
      creator_name: creatorName(auditedCreators.get(`display:${display.id}`)),
      status: display.status === "online" && (!display.last_seen_at || new Date(display.last_seen_at).getTime() < displayHealthCutoff)
        ? "offline"
        : display.status,
    }));
    const targetContentByCampaign = new Map<string, Map<string, unknown[]>>();
    for (const link of targetContent.data ?? []) {
      if (!targetContentByCampaign.has(link.campaign_id)) targetContentByCampaign.set(link.campaign_id, new Map());
      const byDisplay = targetContentByCampaign.get(link.campaign_id)!;
      if (!byDisplay.has(link.display_id)) byDisplay.set(link.display_id, []);
      byDisplay.get(link.display_id)!.push({ position: link.position, duration_seconds: link.duration_seconds, content: link.content });
    }
    const priorityByCampaign = new Map((campaignPriorities.data ?? []).map((entry) => [entry.id, entry.priority]));
    const campaignsWithCreators = (campaigns.data ?? []).map((campaign) => ({
      ...campaign,
      priority: priorityByCampaign.get(campaign.id) ?? 50,
      creator_name: creatorName(campaign.created_by || auditedCreators.get(`campaign:${campaign.id}`)),
      target_assignments: [...(targetContentByCampaign.get(campaign.id) ?? new Map())].map(([display_id, content_links]) => ({ display_id, content_links })),
    }));
    const responsibleNames = new Map((responsibleProfiles.data ?? []).map((entry) => [entry.user_id, entry.display_name || entry.email]));
    const projectsForCustomer = (customerProjects.data ?? []).map((project) => ({
      ...project,
      software_owner_name: project.software_owner ? responsibleNames.get(project.software_owner) || "SwissCompact Team" : "SwissCompact Team",
      hardware_owner_name: project.hardware_owner ? responsibleNames.get(project.hardware_owner) || "SwissCompact Team" : "SwissCompact Team",
    }));
    const acceptanceForDocument = (document: any) => (legalAcceptances.data ?? []).find((acceptance: any) =>
      acceptance.document_id === document.id
      && (document.acceptance_scope === "tenant" || acceptance.user_id === profile.userId)
    );
    const currentLegalDocuments = legalComplianceAvailable ? (legalDocuments.data ?? []).map((document: any) => {
      const acceptance = acceptanceForDocument(document);
      const membership = Array.isArray(acceptance?.membership) ? acceptance.membership[0] : acceptance?.membership;
      return {
        id: document.id,
        documentType: document.document_type,
        acceptanceScope: document.acceptance_scope,
        version: document.version,
        title: document.title,
        summary: document.summary,
        content: document.content_markdown,
        contentHash: document.content_hash,
        effectiveAt: document.effective_at,
        requiresAcceptance: document.requires_acceptance,
        status: document.status,
        acceptedAt: acceptance?.accepted_at ?? null,
        acceptedByName: membership?.display_name ?? null,
      };
    }) : [];
    return json({
      profile,
      sites: sites.data ?? [],
      areas: areas.data ?? [],
      displays: displaysWithHealth,
      content: contentWithPreviews.filter((item) => item.payload?.serviceRequest !== true && item.status !== "archived"),
      archivedContent: contentWithPreviews.filter((item) => item.payload?.serviceRequest !== true && item.status === "archived"),
      serviceRequests: contentWithPreviews.filter((item) => item.payload?.serviceRequest === true),
      customerRecords: {
        quotes: customerQuotes.data ?? [],
        projects: projectsForCustomer,
        invoices: (customerInvoices.data ?? []).map(({ immutable_pdf_path: documentPath, ...invoice }) => ({ ...invoice, document_available: Boolean(documentPath) })),
      },
      projectCollaboration: {
        available: collaborationAvailable,
        briefings: collaborationAvailable ? projectBriefings.data ?? [] : [],
        messages: collaborationAvailable ? projectMessages.data ?? [] : [],
        deliverables: collaborationAvailable ? projectDeliverables.data ?? [] : [],
        versions: collaborationAvailable ? projectVersions.data ?? [] : [],
        reviews: collaborationAvailable ? projectReviews.data ?? [] : [],
        revisions: collaborationAvailable ? projectRevisions.data ?? [] : [],
      },
      partnerNetwork,
      displaySafety: {
        versions: displaySafetyAvailable ? displayVersions.data ?? [] : [],
        tests: displaySafetyAvailable ? displayTests.data ?? [] : [],
        alerts: displaySafetyAvailable ? displayAlerts.data ?? [] : [],
      },
      campaigns: campaignsWithCreators,
      campaignTemplates: {
        available: !campaignTemplates.error,
        items: campaignTemplates.error ? [] : campaignTemplates.data ?? [],
      },
      campaignVersions: {
        available: campaignVersionsAvailable,
        items: campaignVersionsAvailable
          ? (campaignVersions.data ?? []).map((version) => ({
              ...version,
              created_by_name: creatorName(version.created_by),
            }))
          : [],
      },
      displayGroups: {
        available: displayGroupsAvailable,
        items: displayGroupsAvailable
          ? (displayGroups.data ?? []).map((group) => ({
              ...group,
              displayIds: (displayGroupMembers.data ?? []).filter((member) => member.group_id === group.id).map((member) => member.display_id),
            }))
          : [],
      },
      legalCompliance: {
        available: legalComplianceAvailable,
        documents: currentLegalDocuments,
        pendingDocumentIds: currentLegalDocuments.filter((document: any) => document.status === "published" && document.requiresAcceptance && !document.acceptedAt).map((document: any) => document.id),
      },
      dataRights: {
        available: dataRightsAvailable,
        requests: dataRightsAvailable ? (dataRightsRequests.data ?? []).map((entry: any) => ({
          id: entry.id,
          requestType: entry.request_type,
          status: entry.status,
          reason: entry.reason,
          exportExpiresAt: entry.export_expires_at,
          reviewNote: entry.review_note,
          reviewedAt: entry.reviewed_at,
          completedAt: entry.completed_at,
          cancelledAt: entry.cancelled_at,
          createdAt: entry.created_at,
          updatedAt: entry.updated_at,
          requestedBy: entry.requested_by,
          canDownload: entry.status === "completed" && Boolean(entry.export_expires_at) && new Date(entry.export_expires_at).getTime() > Date.now(),
        })) : [],
      },
      notifications: {
        available: notificationsAvailable,
        unreadBySection: notificationsAvailable ? {
          status: (displayAlerts.data ?? []).filter((entry: any) => entry.status !== "resolved" && unreadAfter("status", entry.last_seen_at)).length,
          records: [
            ...(projectMessages.data ?? []).filter((entry: any) => entry.author_type !== "customer").map((entry: any) => entry.created_at),
            ...(projectVersions.data ?? []).filter((entry: any) => entry.submitted_by_type === "swisscompact").map((entry: any) => entry.created_at),
            ...(customerQuotes.data ?? []).map((entry: any) => entry.updated_at),
            ...(customerProjects.data ?? []).map((entry: any) => entry.updated_at),
            ...(customerInvoices.data ?? []).map((entry: any) => entry.updated_at),
          ].filter((timestamp) => unreadAfter("records", timestamp)).length,
          partners: [
            ...(partnerNetwork.partnerships ?? []).filter((entry: any) => entry.direction === "incoming" && entry.status === "pending" && unreadAfter("partners", entry.created_at)),
            ...(partnerNetwork.offers ?? []).filter((entry: any) => entry.direction === "incoming" && entry.status === "pending" && unreadAfter("partners", entry.created_at)),
          ].length,
          support: (supportMessages.data ?? []).filter((entry: any) => entry.author_type !== "customer" && unreadAfter("support", entry.created_at)).length,
          settings: (currentLegalDocuments ?? []).filter((entry: any) => entry.status === "published" && entry.requiresAcceptance && !entry.acceptedAt && unreadAfter("settings", entry.published_at)).length
            + (dataRightsRequests.data ?? []).filter((entry: any) => entry.updated_at !== entry.created_at && unreadAfter("settings", entry.updated_at)).length,
        } : {},
      },
      support: {
        available: supportAvailable,
        feedbackAvailable: supportFeedbackAvailable,
        attachmentsAvailable: supportAttachmentsAvailable,
        policy: supportAvailable ? (supportPolicies.data ?? []).find((entry: any) => entry.package_code === subscription.data?.package_code) ?? null : null,
        tickets: supportAvailable ? supportTickets.data ?? [] : [],
        messages: supportAvailable ? supportMessages.data ?? [] : [],
        feedback: supportFeedbackAvailable ? supportFeedback.data ?? [] : [],
        attachments: supportAttachmentsAvailable ? supportAttachments.data ?? [] : [],
      },
      subscription: subscription.data ?? null,
      members: (members.data ?? []).filter((member) => member.active && member.access_status === "active" && member.verified_at),
      aiCredits: {
        ...publicAiConfiguration(),
        balance: aiBalance.error ? null : (Array.isArray(aiBalance.data) ? aiBalance.data[0] ?? null : aiBalance.data),
      },
      mediaPipeline: { muxVideoEnabled: muxVideoEnabled(), maxVideoBytes: muxVideoEnabled() ? 5 * 1024 * 1024 * 1024 : 250 * 1024 * 1024 },
      generatedAt: snapshotAt,
    });
  }
  const authorized = await authorizeDashboard(request);
  if (isResponse(authorized)) return authorized;
  const { client, profile } = authorized;
  const [clients, opportunities, projects, tasks, quotes, invoices, founderTransactions, aiJobs, settings, audit, approvals, profiles, contentRequests, portalMemberships] = await Promise.all([
    client.from("clients").select("id,customer_number,company_name,contact_name,email,phone,address_line,postal_code,city,country_code,lifecycle,marketing_consent,notes,portal_verified_at,portal_verified_by,created_at,updated_at,tenant:tenants(id,name,slug,status,subscriptions:tenant_subscriptions(id,package_code,status,minimum_ends_on))").order("updated_at", { ascending: false }).limit(200),
    client.from("opportunities").select("id,client_id,portal_request_id,title,stage,owner_area,value_chf,probability,expected_close,next_action,next_action_at,source,created_at,updated_at,client:clients(company_name)").order("updated_at", { ascending: false }).limit(200),
    client.from("projects").select("id,quote_id,opportunity_id,client_id,order_number,title,status,software_owner,hardware_owner,starts_on,target_completion,payment_plan,deposit_received,installation_payment_received,final_payment_received,created_at,updated_at,client:clients(company_name),opportunity:opportunities(title,stage,value_chf)").order("updated_at", { ascending: false }).limit(100),
    client.from("tasks").select("id,project_id,opportunity_id,title,description,responsibility,assignee_user_id,status,priority,due_at,created_at,project:projects(order_number,title)").neq("status", "done").order("due_at", { ascending: true, nullsFirst: false }).limit(200),
    client.from("quotes").select("id,client_id,opportunity_id,quote_number,status,currency,subtotal,total,valid_until,items,terms,immutable_pdf_path,document_hash,accepted_by_name,accepted_by_email,accepted_at,created_at,updated_at,client:clients(company_name),opportunity:opportunities(title,stage)").order("updated_at", { ascending: false }).limit(100),
    client.from("invoices").select("id,quote_id,project_id,invoice_number,status,amount,currency,issued_on,due_on,paid_at,installment,immutable_pdf_path,document_hash,created_at,updated_at,client:clients(company_name),project:projects(order_number,title,status)").order("created_at", { ascending: false }).limit(100),
    client.from("founder_transactions").select("id,transaction_date,transaction_type,paid_by,received_by,amount_chf,category,description,receipt_path,status").order("transaction_date", { ascending: true }),
    client.from("ai_jobs").select("id,bot,action,status,estimated_cost_chf,actual_cost_chf,created_at").order("created_at", { ascending: false }).limit(12),
    client.from("system_settings").select("key,value"),
    client.from("audit_log").select("id,actor_email,action,entity_type,entity_id,created_at").order("created_at", { ascending: false }).limit(12),
    client.from("approvals").select("id,entity_type,entity_id,action,content_hash,requested_by,marcel_approved_at,thomas_approved_at,invalidated_at,executed_at,created_at").is("invalidated_at", null).order("created_at", { ascending: false }).limit(100),
    client.from("dashboard_profiles").select("user_id,email,display_name,role,security_admin,active").eq("active", true).order("display_name"),
    client.from("tenant_content").select("id,tenant_id,title,status,payload,created_at,updated_at,tenant:tenants(name,client_id)").contains("payload", { serviceRequest: true }).order("created_at", { ascending: false }).limit(200),
    client.from("tenant_memberships").select("id,tenant_id,user_id,role,display_name,active,access_status,invited_at,accepted_at,verified_at,revoked_at,tenant:tenants(id,name,client_id)").order("created_at", { ascending: true }).limit(1000),
  ]);
  const firstError = [clients, opportunities, projects, tasks, quotes, invoices, founderTransactions, aiJobs, settings, audit, approvals, profiles, contentRequests, portalMemberships]
    .find((result) => result.error)?.error;
  if (firstError) {
    console.error("dashboard overview:", firstError.message);
    return json({ error: "Dashboard-Datenmodell ist noch nicht vollständig eingerichtet" }, { status: 503 });
  }
  const authAdmin = dashboardSupabase();
  const authUsers = authAdmin ? await authAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }) : null;
  const usersById = new Map((authUsers?.data?.users ?? []).map((user) => [user.id, user]));
  const operationalAdminData = authAdmin ? await Promise.all([
    authAdmin.from("legal_documents").select("id,document_type,acceptance_scope,version,title,summary,content_markdown,content_hash,requires_acceptance,status,effective_at,published_at,created_at").order("created_at", { ascending: false }),
    authAdmin.from("operational_incidents").select("*").order("last_seen_at", { ascending: false }).limit(250),
    authAdmin.from("operational_delivery_attempts").select("*").order("attempted_at", { ascending: false }).limit(250),
    authAdmin.from("operational_recovery_drills").select("*").order("created_at", { ascending: false }).limit(100),
    authAdmin.from("tenant_display_alerts").select("id,tenant_id,display_id,kind,severity,status,message,last_seen_at,display:tenant_displays(name),tenant:tenants(name)").neq("status", "resolved").order("last_seen_at", { ascending: false }).limit(250),
    authAdmin.from("tenant_content").select("id,tenant_id,title,payload,updated_at,tenant:tenants(name)").eq("payload->>processingState", "error").order("updated_at", { ascending: false }).limit(250),
    authAdmin.from("stripe_webhook_events").select("event_id,event_type,error_message,created_at,processed_at").not("error_message", "is", null).order("created_at", { ascending: false }).limit(100),
    authAdmin.from("support_sla_policies").select("*").order("package_code"),
    authAdmin.from("support_tickets").select("*,tenant:tenants(name,client_id),display:tenant_displays(name)").order("created_at", { ascending: false }).limit(500),
    authAdmin.from("support_ticket_messages").select("*").order("created_at").limit(5000),
    authAdmin.from("support_ai_knowledge").select("*").order("category").order("title"),
    authAdmin.from("support_ai_runs").select("*").order("created_at", { ascending: false }).limit(5000),
    authAdmin.from("support_ai_feedback").select("*").order("created_at", { ascending: false }).limit(5000),
    authAdmin.from("support_ticket_attachments").select("*").eq("upload_status", "ready").order("created_at").limit(5000),
  ]) : null;
  const [legalDocumentsAdmin, operationalIncidents, operationalDeliveries, recoveryDrills, fleetAlerts, mediaFailures, stripeFailures, supportPoliciesAdmin, supportTicketsAdmin, supportMessagesAdmin, supportKnowledgeAdmin, supportAiRunsAdmin, supportAiFeedbackAdmin, supportAttachmentsAdmin] = operationalAdminData ?? [];
  const legalManagementAvailable = Boolean(legalDocumentsAdmin && !legalDocumentsAdmin.error);
  const operationsAvailable = Boolean(operationalIncidents && operationalDeliveries && recoveryDrills && !operationalIncidents.error && !operationalDeliveries.error && !recoveryDrills.error);
  const supportAvailable = Boolean(supportPoliciesAdmin && supportTicketsAdmin && supportMessagesAdmin && !supportPoliciesAdmin.error && !supportTicketsAdmin.error && !supportMessagesAdmin.error);
  const supportKnowledgeAvailable = Boolean(supportKnowledgeAdmin && !supportKnowledgeAdmin.error);
  const supportControlCenterAvailable = Boolean(supportAiRunsAdmin && supportAiFeedbackAdmin && !supportAiRunsAdmin.error && !supportAiFeedbackAdmin.error);
  const supportAttachmentsAvailable = Boolean(supportAttachmentsAdmin && !supportAttachmentsAdmin.error);
  const enrichedPortalMemberships = (portalMemberships.data ?? []).map((membership) => {
    const portalUser = usersById.get(membership.user_id);
    return { ...membership, email: portalUser?.email ?? null, email_confirmed_at: portalUser?.email_confirmed_at ?? null, last_sign_in_at: portalUser?.last_sign_in_at ?? null };
  });
  const [projectBriefings, projectMessages, projectDeliverables, projectVersions, projectReviews, projectRevisions, projectCampaigns] = await Promise.all([
    client.from("projects").select("id,tenant_id,briefing").limit(500),
    client.from("project_messages").select("*").order("created_at").limit(1000),
    client.from("project_deliverables").select("*").order("updated_at", { ascending: false }).limit(500),
    client.from("project_deliverable_versions").select("*").order("created_at", { ascending: false }).limit(1000),
    client.from("project_review_decisions").select("*").order("created_at", { ascending: false }).limit(500),
    client.from("project_revision_rounds").select("*").order("created_at", { ascending: false }).limit(500),
    client.from("tenant_campaigns").select("id,tenant_id,name,status").order("updated_at", { ascending: false }).limit(500),
  ]);
  const collaborationResults = [projectBriefings, projectMessages, projectDeliverables, projectVersions, projectReviews, projectRevisions, projectCampaigns];
  const collaborationAvailable = collaborationResults.every((result) => !result.error);
  if (!collaborationAvailable) console.warn("dashboard project collaboration is not migrated yet");
  const dataRightsRequests = await client.from("tenant_data_rights_requests").select("id,tenant_id,membership_id,requested_by,request_type,status,reason,retention_resolution,review_note,reviewed_by,reviewed_at,completed_at,cancelled_at,created_at,updated_at,tenant:tenants(name,client_id),membership:tenant_memberships(display_name)").order("created_at", { ascending: false }).limit(250);
  const dataRightsAvailable = !dataRightsRequests.error;
  if (!dataRightsAvailable) console.warn("dashboard data rights are not migrated yet", dataRightsRequests.error?.message);
  const notificationCursors = await client.from("notification_read_cursors")
    .select("section,last_read_at")
    .eq("user_id", profile.userId)
    .eq("audience", "dashboard")
    .eq("scope_key", "dashboard");
  const notificationsAvailable = !notificationCursors.error;
  if (!notificationsAvailable) console.warn("dashboard notification read cursors are not migrated yet", notificationCursors.error?.message);
  const dashboardReadTimes = new Map((notificationCursors.data ?? []).map((entry: any) => [entry.section, new Date(entry.last_read_at).getTime()]));
  const unreadAfter = (section: string, value: unknown) => {
    const timestamp = value ? new Date(String(value)).getTime() : 0;
    return Number.isFinite(timestamp) && timestamp > (dashboardReadTimes.get(section) ?? 0);
  };
  const unreadSupportTicketIds = new Set([
    ...(supportTicketsAdmin?.data ?? []).filter((entry: any) => entry.ai_handling_status === "escalated" && unreadAfter("support", entry.ai_escalated_at)).map((entry: any) => entry.id),
    ...(supportMessagesAdmin?.data ?? []).filter((entry: any) => entry.author_type === "customer" && unreadAfter("support", entry.created_at)).map((entry: any) => entry.ticket_id),
    ...(supportAiRunsAdmin?.data ?? []).filter((entry: any) => entry.status === "failed" && unreadAfter("support", entry.created_at)).map((entry: any) => entry.ticket_id),
    ...(supportAiFeedbackAdmin?.data ?? []).filter((entry: any) => entry.rating === "not_helpful" && unreadAfter("support", entry.updated_at)).map((entry: any) => entry.ticket_id),
  ].filter(Boolean));
  return json({
    profile,
    clients: clients.data ?? [],
    opportunities: opportunities.data ?? [],
    projects: projects.data ?? [],
    tasks: tasks.data ?? [],
    quotes: quotes.data ?? [],
    invoices: invoices.data ?? [],
    founderTransactions: founderTransactions.data ?? [],
    aiJobs: aiJobs.data ?? [],
    settings: Object.fromEntries((settings.data ?? []).map((entry) => [entry.key, entry.value])),
    audit: audit.data ?? [],
    approvals: approvals.data ?? [],
    profiles: profiles.data ?? [],
    contentRequests: contentRequests.data ?? [],
    portalMemberships: enrichedPortalMemberships,
    notifications: {
      available: notificationsAvailable,
      unreadBySection: notificationsAvailable ? {
        pipeline: (opportunities.data ?? []).filter((entry: any) => entry.stage === "request" && unreadAfter("pipeline", entry.created_at)).length,
        projects: (projectMessages.data ?? []).filter((entry: any) => entry.author_type === "customer" && unreadAfter("projects", entry.created_at)).length,
        production: (contentRequests.data ?? []).filter((entry: any) => unreadAfter("production", entry.created_at)).length,
        support: supportKnowledgeAvailable
          ? unreadSupportTicketIds.size
          : (supportMessagesAdmin?.data ?? []).filter((entry: any) => entry.author_type === "customer" && unreadAfter("support", entry.created_at)).length,
        systems: [
          ...(operationalIncidents?.data ?? []).filter((entry: any) => entry.status !== "resolved" && unreadAfter("systems", entry.last_seen_at)),
          ...(fleetAlerts?.data ?? []).filter((entry: any) => unreadAfter("systems", entry.last_seen_at)),
          ...(mediaFailures?.data ?? []).filter((entry: any) => unreadAfter("systems", entry.updated_at)),
          ...(stripeFailures?.data ?? []).filter((entry: any) => unreadAfter("systems", entry.created_at)),
          ...(aiJobs.data ?? []).filter((entry: any) => entry.status === "failed" && unreadAfter("systems", entry.created_at)),
        ].length,
        security: (dataRightsRequests.data ?? []).filter((entry: any) => unreadAfter("security", entry.created_at)).length,
      } : {},
    },
    dataRights: {
      available: dataRightsAvailable,
      requests: dataRightsAvailable ? (dataRightsRequests.data ?? []).map((entry: any) => ({
        ...entry,
        requester_email: entry.requested_by ? usersById.get(entry.requested_by)?.email ?? null : null,
      })) : [],
    },
    legalManagement: {
      available: legalManagementAvailable,
      documents: legalManagementAvailable ? legalDocumentsAdmin?.data ?? [] : [],
    },
    operations: {
      available: operationsAvailable,
      incidents: operationsAvailable ? operationalIncidents?.data ?? [] : [],
      deliveries: operationsAvailable ? operationalDeliveries?.data ?? [] : [],
      recoveryDrills: operationsAvailable ? recoveryDrills?.data ?? [] : [],
      displayAlerts: fleetAlerts && !fleetAlerts.error ? fleetAlerts.data ?? [] : [],
      mediaFailures: mediaFailures && !mediaFailures.error ? mediaFailures.data ?? [] : [],
      stripeFailures: stripeFailures && !stripeFailures.error ? stripeFailures.data ?? [] : [],
      aiFailures: (aiJobs.data ?? []).filter((job) => job.status === "failed"),
    },
    support: {
      available: supportAvailable,
      aiAvailable: supportKnowledgeAvailable,
      controlCenterAvailable: supportControlCenterAvailable,
      attachmentsAvailable: supportAttachmentsAvailable,
      policies: supportAvailable ? supportPoliciesAdmin?.data ?? [] : [],
      tickets: supportAvailable ? supportTicketsAdmin?.data ?? [] : [],
      messages: supportAvailable ? supportMessagesAdmin?.data ?? [] : [],
      runs: supportControlCenterAvailable ? supportAiRunsAdmin?.data ?? [] : [],
      feedback: supportControlCenterAvailable ? supportAiFeedbackAdmin?.data ?? [] : [],
      attachments: supportAttachmentsAvailable ? supportAttachmentsAdmin?.data ?? [] : [],
      knowledge: supportKnowledgeAvailable ? (supportKnowledgeAdmin?.data ?? []).map((entry: any) => ({
        ...entry,
        approved_by_name: entry.approved_by ? (profiles.data ?? []).find((candidate: any) => candidate.user_id === entry.approved_by)?.display_name ?? null : null,
      })) : [],
    },
    projectCollaboration: {
      available: collaborationAvailable,
      briefings: collaborationAvailable ? projectBriefings.data ?? [] : [],
      messages: collaborationAvailable ? projectMessages.data ?? [] : [],
      deliverables: collaborationAvailable ? projectDeliverables.data ?? [] : [],
      versions: collaborationAvailable ? projectVersions.data ?? [] : [],
      reviews: collaborationAvailable ? projectReviews.data ?? [] : [],
      revisions: collaborationAvailable ? projectRevisions.data ?? [] : [],
      campaigns: collaborationAvailable ? projectCampaigns.data ?? [] : [],
    },
    generatedAt: snapshotAt,
  });
}
