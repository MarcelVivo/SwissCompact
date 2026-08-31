import { authorizeDashboard, authorizePortal, dashboardSupabase, isResponse } from "../_lib/dashboard/auth.js";
import { json } from "../_lib/assistant/security.js";
import { publicAiConfiguration } from "../_lib/portal/ai-config.js";

export const config = { runtime: "nodejs", maxDuration: 15 };

export async function GET(request: Request): Promise<Response> {
  if (new URL(request.url).searchParams.get("audience") === "portal") {
    const authorized = await authorizePortal(request);
    if (isResponse(authorized)) return authorized;
    const { client, profile } = authorized;
    const tenantId = profile.tenantId;
    const customerAdmin = dashboardSupabase();
    if (!customerAdmin) return json({ error: "Kundenvorgänge sind noch nicht konfiguriert" }, { status: 503 });
    const displayHealthRefresh = await client.rpc("refresh_display_delivery_health", { target_tenant: tenantId });
    if (displayHealthRefresh.error) console.warn("portal display health refresh:", displayHealthRefresh.error.message);
    const [sites, areas, displays, content, campaigns, targetContent, subscription, members, creatorEvents, aiBalance, displayVersions, displayTests, displayAlerts] = await Promise.all([
      client.from("tenant_sites").select("id,name,address,timezone,active,created_at,updated_at").eq("tenant_id", tenantId).order("name"),
      client.from("tenant_areas").select("id,site_id,parent_id,name,kind,active,created_at,updated_at").eq("tenant_id", tenantId).order("name"),
      client.from("tenant_displays").select("id,site_id,area_id,name,kind,status,orientation,resolution,screen_size_inches,panel_technology,use_category,last_seen_at,configuration_version,last_acknowledged_version,last_delivery_at,delivery_status,last_delivery_error,fallback_content_id,created_at,updated_at,site:tenant_sites(name),area:tenant_areas(id,name,kind,parent_id)").eq("tenant_id", tenantId).order("updated_at", { ascending: false }),
      client.from("tenant_content").select("id,title,content_type,status,payload,asset_path,created_by,created_at,updated_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(100),
      client.from("tenant_campaigns").select("id,name,theme,status,priority,starts_at,ends_at,schedule,scope_site_id,scope_area_id,created_by,created_at,updated_at,content_links:tenant_campaign_content(position,duration_seconds,content:tenant_content(id,title,content_type,status,preview_path:asset_path)),display_links:tenant_campaign_displays(display_id,display:tenant_displays(id,name,status,site:tenant_sites(name),area:tenant_areas(id,name,kind)))").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(100),
      client.from("tenant_campaign_display_content").select("campaign_id,display_id,position,duration_seconds,content:tenant_content(id,title,content_type,status)").eq("tenant_id", tenantId).order("position"),
      client.from("tenant_subscriptions").select("package_code,status,starts_on,minimum_ends_on,monthly_amount_chf,included_ai_credits").eq("tenant_id", tenantId).in("status", ["trial","active","past_due","paused"]).maybeSingle(),
      client.from("tenant_memberships").select("id,role,display_name,user_id,active,access_status,invited_at,accepted_at,verified_at").eq("tenant_id", tenantId),
      client.from("tenant_audit_log").select("entity_type,entity_id,actor_user_id,created_at").eq("tenant_id", tenantId).eq("action", "create").in("entity_type", ["display", "content", "campaign"]).order("created_at", { ascending: true }),
      client.rpc("get_ai_credit_balance", { target_tenant: tenantId }),
      client.from("tenant_display_config_versions").select("id,display_id,version,source,campaign_id,state,previous_version,created_at").eq("tenant_id", tenantId).order("version", { ascending: false }).limit(500),
      client.from("tenant_display_test_publications").select("id,display_id,campaign_id,configuration_version,previous_version,status,expires_at,created_at").eq("tenant_id", tenantId).eq("status", "active").limit(100),
      client.from("tenant_display_alerts").select("id,display_id,kind,severity,status,message,metadata,first_seen_at,last_seen_at,resolved_at").eq("tenant_id", tenantId).neq("status", "resolved").order("last_seen_at", { ascending: false }).limit(200),
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
    const firstError = [sites, areas, displays, content, campaigns, targetContent, subscription, members, creatorEvents].find((result) => result.error)?.error;
    if (firstError) {
      console.error("portal overview:", firstError.message);
      return json({ error: "Das Kundenportal-Datenmodell ist noch nicht eingerichtet" }, { status: 503 });
    }
    const displaySafetyAvailable = [displayVersions, displayTests, displayAlerts].every((result) => !result.error);
    if (!displaySafetyAvailable) console.warn("portal display safety is temporarily unavailable", {
      versions: displayVersions.error?.message,
      tests: displayTests.error?.message,
      alerts: displayAlerts.error?.message,
    });
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
    const contentWithPreviews = await Promise.all((content.data ?? []).map(async (item) => {
      const enriched = { ...item, creator_name: creatorName(item.created_by || auditedCreators.get(`content:${item.id}`)) };
      if (!item.asset_path || item.payload?.uploadState !== "ready") return { ...enriched, preview_url: null };
      const preview = await client.storage.from("swisscompact-media").createSignedUrl(item.asset_path, 60 * 60);
      return { ...enriched, preview_url: preview.data?.signedUrl ?? null };
    }));
    const displayHealthCutoff = Date.now() - 90_000;
    const displaysWithHealth = (displays.data ?? []).map((display) => ({
      ...display,
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
    const campaignsWithCreators = (campaigns.data ?? []).map((campaign) => ({
      ...campaign,
      creator_name: creatorName(campaign.created_by || auditedCreators.get(`campaign:${campaign.id}`)),
      target_assignments: [...(targetContentByCampaign.get(campaign.id) ?? new Map())].map(([display_id, content_links]) => ({ display_id, content_links })),
    }));
    const responsibleNames = new Map((responsibleProfiles.data ?? []).map((entry) => [entry.user_id, entry.display_name || entry.email]));
    const projectsForCustomer = (customerProjects.data ?? []).map((project) => ({
      ...project,
      software_owner_name: project.software_owner ? responsibleNames.get(project.software_owner) || "SwissCompact Team" : "SwissCompact Team",
      hardware_owner_name: project.hardware_owner ? responsibleNames.get(project.hardware_owner) || "SwissCompact Team" : "SwissCompact Team",
    }));
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
      displaySafety: {
        versions: displaySafetyAvailable ? displayVersions.data ?? [] : [],
        tests: displaySafetyAvailable ? displayTests.data ?? [] : [],
        alerts: displaySafetyAvailable ? displayAlerts.data ?? [] : [],
      },
      campaigns: campaignsWithCreators,
      subscription: subscription.data ?? null,
      members: (members.data ?? []).filter((member) => member.active && member.access_status === "active" && member.verified_at),
      aiCredits: {
        ...publicAiConfiguration(),
        balance: aiBalance.error ? null : (Array.isArray(aiBalance.data) ? aiBalance.data[0] ?? null : aiBalance.data),
      },
      generatedAt: new Date().toISOString(),
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
    generatedAt: new Date().toISOString(),
  });
}
