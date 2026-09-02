import { dashboardSupabase, writeAudit, type DashboardProfile } from "../dashboard/auth.js";
import { cleanText, json } from "../assistant/security.js";

type KnowledgeAction = "create_support_ai_knowledge" | "update_support_ai_knowledge" | "approve_support_ai_knowledge" | "archive_support_ai_knowledge" | "delete_support_ai_knowledge";
type Payload = Record<string, unknown>;

const actions = new Set<KnowledgeAction>([
  "create_support_ai_knowledge",
  "update_support_ai_knowledge",
  "approve_support_ai_knowledge",
  "archive_support_ai_knowledge",
  "delete_support_ai_knowledge",
]);
const categories = new Set(["general", "incident", "question", "training", "content"]);

export function isSupportKnowledgeAction(action: string): action is KnowledgeAction {
  return actions.has(action as KnowledgeAction);
}

export async function handleSupportKnowledgeAction(client: any, profile: DashboardProfile, body: Payload, action: KnowledgeAction): Promise<Response> {
  if (!["owner_admin", "admin"].includes(profile.role)) return json({ error: "Nur Administratoren dürfen die KI-Wissensbasis bearbeiten" }, { status: 403 });
  const admin = dashboardSupabase();
  if (!admin) return json({ error: "KI-Wissensbasis ist nicht konfiguriert" }, { status: 503 });
  const id = cleanText(body.id, 80);
  const now = new Date().toISOString();

  if (action === "create_support_ai_knowledge") {
    const category = cleanText(body.category, 30);
    const title = cleanText(body.title, 180);
    const content = cleanText(body.content, 12000);
    const sourceReference = cleanText(body.sourceReference, 500) || null;
    if (!categories.has(category) || title.length < 3 || content.length < 10) return json({ error: "Kategorie, Titel oder Anleitung ist unvollständig" }, { status: 400 });
    const created = await admin.from("support_ai_knowledge").insert({
      category, title, content, source_reference: sourceReference,
      active: false, approved_by: null, approved_at: null,
    }).select("*").single();
    if (created.error) return json({ error: created.error.code === "23505" ? "Eine Anleitung mit diesem Titel existiert in dieser Kategorie bereits" : created.error.message }, { status: 409 });
    await writeAudit(client, profile, "support_ai_knowledge_created", "support_ai_knowledge", created.data.id, null, { category, title, active: false });
    return json({ ok: true, record: created.data });
  }

  if (!id) return json({ error: "Wissenseintrag fehlt" }, { status: 400 });
  const previous = await admin.from("support_ai_knowledge").select("*").eq("id", id).maybeSingle();
  if (!previous.data) return json({ error: "Wissenseintrag nicht gefunden" }, { status: 404 });

  if (action === "update_support_ai_knowledge") {
    const category = cleanText(body.category, 30);
    const title = cleanText(body.title, 180);
    const content = cleanText(body.content, 12000);
    const sourceReference = cleanText(body.sourceReference, 500) || null;
    const expectedUpdatedAt = cleanText(body.updatedAt, 80);
    if (!categories.has(category) || title.length < 3 || content.length < 10 || !expectedUpdatedAt) return json({ error: "Kategorie, Titel oder Anleitung ist unvollständig" }, { status: 400 });
    const updated = await admin.from("support_ai_knowledge").update({
      category, title, content, source_reference: sourceReference,
      active: false, approved_by: null, approved_at: null, updated_at: now,
    }).eq("id", id).eq("updated_at", expectedUpdatedAt).select("*").maybeSingle();
    if (updated.error || !updated.data) return json({ error: updated.error?.code === "23505" ? "Eine Anleitung mit diesem Titel existiert in dieser Kategorie bereits" : "Der Eintrag wurde zwischenzeitlich geändert. Bitte neu laden." }, { status: 409 });
    await writeAudit(client, profile, "support_ai_knowledge_updated", "support_ai_knowledge", id, previous.data, updated.data);
    return json({ ok: true, record: updated.data });
  }

  if (action === "approve_support_ai_knowledge") {
    if (!profile.securityAdmin) return json({ error: "Nur der Hauptadmin darf KI-Anleitungen freigeben" }, { status: 403 });
    const approved = await admin.from("support_ai_knowledge").update({ active: true, approved_by: profile.userId, approved_at: now, updated_at: now }).eq("id", id).eq("updated_at", previous.data.updated_at).select("*").maybeSingle();
    if (approved.error || !approved.data) return json({ error: "Die Anleitung wurde zwischenzeitlich geändert. Bitte neu laden." }, { status: 409 });
    await writeAudit(client, profile, "support_ai_knowledge_approved", "support_ai_knowledge", id, { active: previous.data.active, approvedAt: previous.data.approved_at }, { active: true, approvedAt: now });
    return json({ ok: true, record: approved.data });
  }

  if (action === "archive_support_ai_knowledge") {
    const archived = await admin.from("support_ai_knowledge").update({ active: false, updated_at: now }).eq("id", id).eq("updated_at", previous.data.updated_at).select("*").maybeSingle();
    if (archived.error || !archived.data) return json({ error: "Die Anleitung wurde zwischenzeitlich geändert. Bitte neu laden." }, { status: 409 });
    await writeAudit(client, profile, "support_ai_knowledge_archived", "support_ai_knowledge", id, { active: previous.data.active }, { active: false });
    return json({ ok: true, record: archived.data });
  }

  if (!profile.securityAdmin) return json({ error: "Nur der Hauptadmin darf Entwürfe löschen" }, { status: 403 });
  if (previous.data.approved_at) return json({ error: "Bereits freigegebene Anleitungen bleiben aus Nachweisgründen archiviert" }, { status: 409 });
  const deleted = await admin.from("support_ai_knowledge").delete().eq("id", id).is("approved_at", null).select("id").maybeSingle();
  if (deleted.error || !deleted.data) return json({ error: "Nur ein ungeprüfter Entwurf kann gelöscht werden" }, { status: 409 });
  await writeAudit(client, profile, "support_ai_knowledge_deleted", "support_ai_knowledge", id, previous.data, null);
  return json({ ok: true });
}
