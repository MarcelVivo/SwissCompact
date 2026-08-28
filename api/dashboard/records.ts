import { authorizeDashboard, isResponse, writeAudit } from "../_lib/dashboard/auth.js";
import { cleanText, json, validatePublicPost } from "../_lib/assistant/security.js";

type Payload = Record<string, unknown>;

function amount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
}

export async function POST(request: Request): Promise<Response> {
  const guard = validatePublicPost(request, {
    key: "dashboard-records",
    limit: 80,
    windowMs: 10 * 60_000,
    contentTypes: ["application/json"],
    maxBytes: 32_000,
  });
  if (guard) return guard;
  const authorized = await authorizeDashboard(request);
  if (isResponse(authorized)) return authorized;
  const { client, profile } = authorized;
  const body = await request.json() as Payload;
  const action = cleanText(body.action, 80);

  if (action === "create_client") {
    const record = {
      company_name: cleanText(body.companyName, 200),
      contact_name: cleanText(body.contactName, 200) || null,
      email: cleanText(body.email, 200).toLowerCase() || null,
      phone: cleanText(body.phone, 80) || null,
      lifecycle: "lead",
      created_by: profile.userId,
    };
    if (!record.company_name) return json({ error: "Firmenname fehlt" }, { status: 400 });
    const result = await client.from("clients").insert(record).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "create", "client", result.data.id, undefined, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "create_opportunity") {
    const record = {
      client_id: typeof body.clientId === "string" && body.clientId ? body.clientId : null,
      title: cleanText(body.title, 240),
      stage: "request",
      owner_area: ["marcel", "thomas", "shared", "ai"].includes(String(body.ownerArea)) ? body.ownerArea : "shared",
      value_chf: amount(body.valueChf),
      probability: 20,
      next_action: cleanText(body.nextAction, 500) || null,
      created_by: profile.userId,
    };
    if (!record.title) return json({ error: "Titel fehlt" }, { status: 400 });
    const result = await client.from("opportunities").insert(record).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "create", "opportunity", result.data.id, undefined, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "move_opportunity") {
    const id = cleanText(body.id, 80);
    const stage = cleanText(body.stage, 80);
    const allowed = [
      "request","qualification","consulting","customer_decision","quote","confirmed","deposit_50","planning",
      "hardware_concept","software_development","procurement","installation","installation_30","configuration",
      "acceptance","final_invoice_20","completed","maintenance","paused","lost","cancelled",
    ];
    if (!id || !allowed.includes(stage)) return json({ error: "Ungültiger Statuswechsel" }, { status: 400 });
    const previous = await client.from("opportunities").select("*").eq("id", id).single();
    if (previous.error) return json({ error: previous.error.message }, { status: 404 });
    const result = await client.from("opportunities").update({ stage, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "stage_change", "opportunity", id, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "create_task") {
    const record = {
      title: cleanText(body.title, 240),
      description: cleanText(body.description, 1200) || null,
      responsibility: ["marcel", "thomas", "shared", "ai"].includes(String(body.responsibility)) ? body.responsibility : "shared",
      status: "open",
      priority: ["low", "normal", "high", "urgent"].includes(String(body.priority)) ? body.priority : "normal",
      due_at: typeof body.dueAt === "string" && body.dueAt ? body.dueAt : null,
    };
    if (!record.title) return json({ error: "Aufgabentitel fehlt" }, { status: 400 });
    const result = await client.from("tasks").insert(record).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "create", "task", result.data.id, undefined, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "complete_task") {
    const id = cleanText(body.id, 80);
    const previous = await client.from("tasks").select("*").eq("id", id).single();
    if (previous.error) return json({ error: previous.error.message }, { status: 404 });
    const result = await client.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "complete", "task", id, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "update_founder_transaction") {
    const id = cleanText(body.id, 80);
    const category = cleanText(body.category, 160);
    const previous = await client.from("founder_transactions").select("*").eq("id", id).single();
    if (previous.error) return json({ error: previous.error.message }, { status: 404 });
    const result = await client.from("founder_transactions").update({ category: category || null }).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "categorize", "founder_transaction", id, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  return json({ error: "Unbekannte Aktion" }, { status: 400 });
}
