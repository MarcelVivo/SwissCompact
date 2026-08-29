import { authorizeDashboard, isResponse } from "../_lib/dashboard/auth.js";
import { json } from "../_lib/assistant/security.js";

export const config = { runtime: "nodejs", maxDuration: 15 };

export async function GET(request: Request): Promise<Response> {
  const authorized = await authorizeDashboard(request);
  if (isResponse(authorized)) return authorized;
  const { client, profile } = authorized;
  const [clients, opportunities, projects, tasks, invoices, founderTransactions, aiJobs, settings, audit, approvals, profiles] = await Promise.all([
    client.from("clients").select("id,customer_number,company_name,contact_name,email,phone,address_line,postal_code,city,country_code,lifecycle,marketing_consent,notes,created_at,updated_at").order("updated_at", { ascending: false }).limit(200),
    client.from("opportunities").select("id,client_id,title,stage,owner_area,value_chf,probability,expected_close,next_action,next_action_at,source,created_at,updated_at,client:clients(company_name)").order("updated_at", { ascending: false }).limit(200),
    client.from("projects").select("id,opportunity_id,client_id,order_number,title,status,software_owner,hardware_owner,starts_on,target_completion,payment_plan,deposit_received,installation_payment_received,final_payment_received,created_at,updated_at,client:clients(company_name),opportunity:opportunities(title,stage,value_chf)").order("updated_at", { ascending: false }).limit(100),
    client.from("tasks").select("id,project_id,opportunity_id,title,description,responsibility,assignee_user_id,status,priority,due_at,created_at,project:projects(order_number,title)").neq("status", "done").order("due_at", { ascending: true, nullsFirst: false }).limit(200),
    client.from("invoices").select("id,invoice_number,status,amount,due_on,installment,client:clients(company_name)").order("created_at", { ascending: false }).limit(12),
    client.from("founder_transactions").select("id,transaction_date,transaction_type,paid_by,received_by,amount_chf,category,description,receipt_path,status").order("transaction_date", { ascending: true }),
    client.from("ai_jobs").select("id,bot,action,status,estimated_cost_chf,actual_cost_chf,created_at").order("created_at", { ascending: false }).limit(12),
    client.from("system_settings").select("key,value"),
    client.from("audit_log").select("id,actor_email,action,entity_type,entity_id,created_at").order("created_at", { ascending: false }).limit(12),
    client.from("approvals").select("id,entity_type,entity_id,action,content_hash,requested_by,marcel_approved_at,thomas_approved_at,invalidated_at,executed_at,created_at").is("invalidated_at", null).order("created_at", { ascending: false }).limit(100),
    client.from("dashboard_profiles").select("user_id,email,display_name,role,security_admin,active").eq("active", true).order("display_name"),
  ]);
  const firstError = [clients, opportunities, projects, tasks, invoices, founderTransactions, aiJobs, settings, audit, approvals, profiles]
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
