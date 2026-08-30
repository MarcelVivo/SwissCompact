import { authorizeDashboard, authorizePortal, isResponse } from "../_lib/dashboard/auth.js";
import { json } from "../_lib/assistant/security.js";

export const config = { runtime: "nodejs", maxDuration: 15 };

export async function GET(request: Request): Promise<Response> {
  if (new URL(request.url).searchParams.get("audience") === "portal") {
    const authorized = await authorizePortal(request);
    if (isResponse(authorized)) return authorized;
    const { client, profile } = authorized;
    const tenantId = profile.tenantId;
    const [sites, displays, content, campaigns, subscription, members] = await Promise.all([
      client.from("tenant_sites").select("id,name,address,timezone,active,created_at,updated_at").eq("tenant_id", tenantId).order("name"),
      client.from("tenant_displays").select("id,site_id,name,kind,status,orientation,resolution,last_seen_at,created_at,updated_at,site:tenant_sites(name)").eq("tenant_id", tenantId).order("updated_at", { ascending: false }),
      client.from("tenant_content").select("id,title,content_type,status,payload,asset_path,created_at,updated_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(100),
      client.from("tenant_campaigns").select("id,name,status,starts_at,ends_at,schedule,created_at,updated_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(100),
      client.from("tenant_subscriptions").select("package_code,status,starts_on,minimum_ends_on,monthly_amount_chf,included_ai_credits").eq("tenant_id", tenantId).in("status", ["trial","active","past_due","paused"]).maybeSingle(),
      client.from("tenant_memberships").select("id,role,display_name,user_id,active").eq("tenant_id", tenantId).eq("active", true),
    ]);
    const firstError = [sites, displays, content, campaigns, subscription, members].find((result) => result.error)?.error;
    if (firstError) {
      console.error("portal overview:", firstError.message);
      return json({ error: "Das Kundenportal-Datenmodell ist noch nicht eingerichtet" }, { status: 503 });
    }
    const contentWithPreviews = await Promise.all((content.data ?? []).map(async (item) => {
      if (!item.asset_path || item.payload?.uploadState !== "ready") return { ...item, preview_url: null };
      const preview = await client.storage.from("swisscompact-media").createSignedUrl(item.asset_path, 60 * 60);
      return { ...item, preview_url: preview.data?.signedUrl ?? null };
    }));
    return json({
      profile,
      sites: sites.data ?? [],
      displays: displays.data ?? [],
      content: contentWithPreviews,
      campaigns: campaigns.data ?? [],
      subscription: subscription.data ?? null,
      members: members.data ?? [],
      generatedAt: new Date().toISOString(),
    });
  }
  const authorized = await authorizeDashboard(request);
  if (isResponse(authorized)) return authorized;
  const { client, profile } = authorized;
  const [clients, opportunities, projects, tasks, quotes, invoices, founderTransactions, aiJobs, settings, audit, approvals, profiles] = await Promise.all([
    client.from("clients").select("id,customer_number,company_name,contact_name,email,phone,address_line,postal_code,city,country_code,lifecycle,marketing_consent,notes,created_at,updated_at").order("updated_at", { ascending: false }).limit(200),
    client.from("opportunities").select("id,client_id,title,stage,owner_area,value_chf,probability,expected_close,next_action,next_action_at,source,created_at,updated_at,client:clients(company_name)").order("updated_at", { ascending: false }).limit(200),
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
  ]);
  const firstError = [clients, opportunities, projects, tasks, quotes, invoices, founderTransactions, aiJobs, settings, audit, approvals, profiles]
    .find((result) => result.error)?.error;
  if (firstError) {
    console.error("dashboard overview:", firstError.message);
    return json({ error: "Dashboard-Datenmodell ist noch nicht vollständig eingerichtet" }, { status: 503 });
  }
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
    generatedAt: new Date().toISOString(),
  });
}
