import type { PortalProfile } from "../dashboard/auth.js";
import { cleanText, json, validEmail } from "../assistant/security.js";
import { escapeHtml } from "../assistant/spamGuard.js";
import { Resend } from "resend";

type PartnerPayload = Record<string, unknown>;

export type PartnerNetwork = {
  available: boolean;
  partnerships: Array<Record<string, unknown>>;
  offers: Array<Record<string, unknown>>;
};

function canonicalTenants(left: string, right: string): [string, string] {
  return left.localeCompare(right) < 0 ? [left, right] : [right, left];
}

async function authUserByEmail(client: any, email: string): Promise<any | null> {
  for (let page = 1; page <= 10; page += 1) {
    const users = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (users.error) throw new Error("Portalbenutzer konnten nicht geprüft werden");
    const match = users.data.users.find((user: any) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (users.data.users.length < 100) return null;
  }
  return null;
}

async function partnerTenantByEmail(admin: any, profile: PortalProfile, email: string): Promise<{ id: string; name: string } | null> {
  const user = await authUserByEmail(admin, email);
  if (!user?.email_confirmed_at) return null;
  const memberships = await admin.from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .eq("access_status", "active")
    .not("verified_at", "is", null)
    .neq("tenant_id", profile.tenantId);
  if (memberships.error) throw new Error("Partnerzugang konnte nicht geprüft werden");
  const tenantIds = [...new Set<string>((memberships.data ?? []).map((membership: any) => membership.tenant_id))];
  if (!tenantIds.length) return null;
  const tenants = await admin.from("tenants").select("id,name,status,client_id").in("id", tenantIds).eq("status", "active");
  if (tenants.error) throw new Error("Partnerportal konnte nicht geprüft werden");
  const verified: Array<{ id: string; name: string }> = [];
  for (const tenant of tenants.data ?? []) {
    if (!tenant.client_id) continue;
    const customer = await admin.rpc("is_verified_portal_customer", { target_tenant: tenant.id });
    if (!customer.error && customer.data === true) verified.push({ id: tenant.id, name: tenant.name });
  }
  if (verified.length > 1) throw new Error("Diese E-Mail gehört zu mehreren Kundenportalen. Verwenden Sie eine eindeutige Partner-E-Mail.");
  return verified[0] ?? null;
}

async function sendPartnerInvitation(email: string, senderName: string, senderTenant: string, message: string | null): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  let portalUrl = "https://www.swisscompact.com/portal";
  try { if (process.env.SITE_URL) portalUrl = `${new URL(process.env.SITE_URL).origin}/portal`; } catch { /* sichere Standardadresse */ }
  const optionalMessage = message ? `<blockquote style="margin:20px 0;padding:14px 18px;border-left:4px solid #16875d;background:#f3f7f5">${escapeHtml(message)}</blockquote>` : "";
  const sent = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: "SwissCompact Partnerprogramm <kontakt@swisscompact.com>",
    to: email,
    replyTo: "kontakt@swisscompact.com",
    subject: `${senderTenant} lädt Sie zur gegenseitigen Partnerwerbung ein`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#18181b"><p style="color:#c8102e;font-weight:800;letter-spacing:.12em">SWISSCOMPACT PARTNERWERBUNG</p><h1>${escapeHtml(senderTenant)} möchte sich mit Ihnen verbinden.</h1><p>${escapeHtml(senderName)} hat Sie eingeladen, lokale Werbung kontrolliert auszutauschen.</p>${optionalMessage}<p><strong>Wichtig:</strong> Ein Partner kann niemals direkt auf Ihren Bildschirmen veröffentlichen. Sie prüfen jeden Inhalt und wählen Bildschirm sowie Zeitraum selbst.</p><p style="margin:30px 0"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:15px 22px;background:#18181b;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Einladung im Portal prüfen</a></p><p>Freundliche Grüsse<br>SwissCompact</p></div>`,
  });
  if (sent.error) console.warn("partner invitation email failed", sent.error.message);
}

export async function loadPartnerNetwork(admin: any, tenantId: string): Promise<PartnerNetwork> {
  const partnerships = await admin.from("tenant_partnerships")
    .select("id,tenant_a_id,tenant_b_id,requested_by_tenant_id,invitation_email,message,status,created_at,updated_at,responded_at")
    .or(`tenant_a_id.eq.${tenantId},tenant_b_id.eq.${tenantId}`)
    .order("updated_at", { ascending: false });
  if (partnerships.error) {
    console.warn("portal partner network is not migrated yet", partnerships.error.message);
    return { available: false, partnerships: [], offers: [] };
  }
  const partnershipIds = (partnerships.data ?? []).map((item: any) => item.id);
  const offers = partnershipIds.length
    ? await admin.from("tenant_partner_content_offers")
      .select("id,partnership_id,sender_tenant_id,recipient_tenant_id,source_content_id,recipient_content_id,title_snapshot,message,proposed_starts_at,proposed_ends_at,status,created_at,updated_at,responded_at")
      .in("partnership_id", partnershipIds)
      .order("updated_at", { ascending: false })
    : { data: [], error: null };
  if (offers.error) {
    console.warn("portal partner offers unavailable", offers.error.message);
    return { available: false, partnerships: [], offers: [] };
  }
  const tenantIds = [...new Set<string>((partnerships.data ?? []).flatMap((item: any) => [item.tenant_a_id, item.tenant_b_id]))];
  const tenants = tenantIds.length ? await admin.from("tenants").select("id,name").in("id", tenantIds) : { data: [] };
  const names = new Map((tenants.data ?? []).map((tenant: any) => [tenant.id, tenant.name]));
  return {
    available: true,
    partnerships: (partnerships.data ?? []).map((item: any) => {
      const partnerTenantId = item.tenant_a_id === tenantId ? item.tenant_b_id : item.tenant_a_id;
      return {
        ...item,
        partner_tenant_id: partnerTenantId,
        partner_name: names.get(partnerTenantId) || "Partnerbetrieb",
        direction: item.requested_by_tenant_id === tenantId ? "outgoing" : "incoming",
      };
    }),
    offers: (offers.data ?? []).map((item: any) => ({
      ...item,
      direction: item.sender_tenant_id === tenantId ? "outgoing" : "incoming",
      sender_name: names.get(item.sender_tenant_id) || "Partnerbetrieb",
      recipient_name: names.get(item.recipient_tenant_id) || "Partnerbetrieb",
    })),
  };
}

export async function handlePartnerNetworkAction(
  admin: any,
  profile: PortalProfile,
  body: PartnerPayload,
): Promise<Response | null> {
  const action = cleanText(body.action, 80);
  if (!action.includes("partner")) return null;
  const now = new Date().toISOString();
  const canManage = ["owner", "admin"].includes(profile.role);

  if (action === "invite_partner") {
    if (!canManage) return json({ error: "Nur Inhaber oder Administratoren dürfen Partner einladen" }, { status: 403 });
    const email = cleanText(body.email, 320).toLowerCase();
    const message = cleanText(body.message, 1000) || null;
    if (!validEmail(email) || email === profile.email.toLowerCase()) return json({ error: "Geben Sie die Portal-E-Mail des Partnerbetriebs ein" }, { status: 400 });
    let target: { id: string; name: string } | null;
    try { target = await partnerTenantByEmail(admin, profile, email); }
    catch (reason) { return json({ error: reason instanceof Error ? reason.message : "Partner konnte nicht geprüft werden" }, { status: 400 }); }
    if (!target) return json({ error: "Unter dieser E-Mail wurde kein aktives SwissCompact-Kundenportal gefunden" }, { status: 404 });
    const [tenantA, tenantB] = canonicalTenants(profile.tenantId, target.id);
    const existing = await admin.from("tenant_partnerships").select("id,status").eq("tenant_a_id", tenantA).eq("tenant_b_id", tenantB).maybeSingle();
    if (existing.data?.status === "active") return json({ error: `${target.name} ist bereits Ihr Partner` }, { status: 409 });
    if (existing.data?.status === "pending") return json({ error: "Für diesen Partnerbetrieb ist bereits eine Einladung offen" }, { status: 409 });
    const values = { tenant_a_id: tenantA, tenant_b_id: tenantB, requested_by_tenant_id: profile.tenantId, invitation_email: email, message, status: "pending", created_by: profile.userId, responded_by: null, responded_at: null, revoked_at: null, updated_at: now };
    const saved = existing.data
      ? await admin.from("tenant_partnerships").update(values).eq("id", existing.data.id).select("id").single()
      : await admin.from("tenant_partnerships").insert(values).select("id").single();
    if (saved.error) return json({ error: "Partnereinladung konnte nicht gespeichert werden" }, { status: 400 });
    await admin.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "partner_invited", entity_type: "partnership", entity_id: saved.data.id, metadata: { partnerTenantId: target.id, partnerName: target.name, email } });
    await sendPartnerInvitation(email, profile.displayName, profile.tenantName, message);
    return json({ ok: true, partnershipId: saved.data.id, partnerName: target.name });
  }

  if (action === "respond_partner_invitation") {
    if (!canManage) return json({ error: "Nur Inhaber oder Administratoren dürfen Einladungen beantworten" }, { status: 403 });
    const id = cleanText(body.id, 80);
    const decision = cleanText(body.decision, 20);
    if (!id || !["accept", "decline"].includes(decision)) return json({ error: "Entscheidung fehlt" }, { status: 400 });
    const invitation = await admin.from("tenant_partnerships").select("id,tenant_a_id,tenant_b_id,requested_by_tenant_id,status").eq("id", id).maybeSingle();
    if (!invitation.data || ![invitation.data.tenant_a_id, invitation.data.tenant_b_id].includes(profile.tenantId)) return json({ error: "Einladung nicht gefunden" }, { status: 404 });
    if (invitation.data.requested_by_tenant_id === profile.tenantId) return json({ error: "Die Einladung muss vom Partnerbetrieb beantwortet werden" }, { status: 409 });
    if (invitation.data.status !== "pending") return json({ error: "Diese Einladung wurde bereits beantwortet" }, { status: 409 });
    const status = decision === "accept" ? "active" : "declined";
    const updated = await admin.from("tenant_partnerships").update({ status, responded_by: profile.userId, responded_at: now, updated_at: now }).eq("id", id).eq("status", "pending");
    if (updated.error) return json({ error: "Entscheidung konnte nicht gespeichert werden" }, { status: 400 });
    await admin.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: `partner_${status}`, entity_type: "partnership", entity_id: id });
    return json({ ok: true });
  }

  if (action === "revoke_partnership") {
    if (!canManage) return json({ error: "Nur Inhaber oder Administratoren dürfen Partnerschaften beenden" }, { status: 403 });
    const id = cleanText(body.id, 80);
    const partnership = await admin.from("tenant_partnerships").select("id,tenant_a_id,tenant_b_id,status").eq("id", id).maybeSingle();
    if (!partnership.data || ![partnership.data.tenant_a_id, partnership.data.tenant_b_id].includes(profile.tenantId)) return json({ error: "Partnerschaft nicht gefunden" }, { status: 404 });
    await admin.from("tenant_partner_content_offers").update({ status: "withdrawn", updated_at: now }).eq("partnership_id", id).eq("status", "pending");
    const updated = await admin.from("tenant_partnerships").update({ status: "revoked", revoked_at: now, updated_at: now }).eq("id", id);
    if (updated.error) return json({ error: "Partnerschaft konnte nicht beendet werden" }, { status: 400 });
    return json({ ok: true });
  }

  if (action === "create_partner_offer") {
    const partnershipId = cleanText(body.partnershipId, 80);
    const contentId = cleanText(body.contentId, 80);
    const message = cleanText(body.message, 1000) || null;
    const startsAt = cleanText(body.startsAt, 50) || null;
    const endsAt = cleanText(body.endsAt, 50) || null;
    if (!partnershipId || !contentId) return json({ error: "Partner und Inhalt fehlen" }, { status: 400 });
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return json({ error: "Das Enddatum muss nach dem Start liegen" }, { status: 400 });
    const partnership = await admin.from("tenant_partnerships").select("id,tenant_a_id,tenant_b_id,status").eq("id", partnershipId).eq("status", "active").maybeSingle();
    if (!partnership.data || ![partnership.data.tenant_a_id, partnership.data.tenant_b_id].includes(profile.tenantId)) return json({ error: "Aktive Partnerschaft nicht gefunden" }, { status: 404 });
    const recipientTenantId = partnership.data.tenant_a_id === profile.tenantId ? partnership.data.tenant_b_id : partnership.data.tenant_a_id;
    const content = await admin.from("tenant_content").select("id,title,content_type,status,payload,asset_path").eq("id", contentId).eq("tenant_id", profile.tenantId).in("status", ["approved", "published"]).maybeSingle();
    const payload = content.data?.payload || {};
    const ready = payload.uploadState === "ready" && (!payload.processingState || payload.processingState === "ready");
    if (!content.data || !["image", "video"].includes(content.data.content_type) || !content.data.asset_path || !ready) return json({ error: "Nur vollständig aufbereitete und freigegebene Bilder oder Videos können angeboten werden" }, { status: 409 });
    const created = await admin.from("tenant_partner_content_offers").insert({ partnership_id: partnershipId, sender_tenant_id: profile.tenantId, recipient_tenant_id: recipientTenantId, source_content_id: contentId, title_snapshot: content.data.title, message, proposed_starts_at: startsAt, proposed_ends_at: endsAt, status: "pending", created_by: profile.userId }).select("id").single();
    if (created.error) return json({ error: created.error.code === "23505" ? "Dieser Inhalt wurde dem Partner bereits angeboten" : "Werbeangebot konnte nicht gesendet werden" }, { status: 400 });
    await admin.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "partner_content_offered", entity_type: "partner_offer", entity_id: created.data.id, metadata: { recipientTenantId, contentId } });
    return json({ ok: true, offerId: created.data.id });
  }

  if (action === "respond_partner_offer") {
    if (!canManage) return json({ error: "Nur Inhaber oder Administratoren dürfen Partnerwerbung übernehmen" }, { status: 403 });
    const id = cleanText(body.id, 80);
    const decision = cleanText(body.decision, 20);
    if (!id || !["accept", "decline"].includes(decision)) return json({ error: "Entscheidung fehlt" }, { status: 400 });
    const offer = await admin.from("tenant_partner_content_offers").select("id,partnership_id,sender_tenant_id,recipient_tenant_id,source_content_id,status,title_snapshot,proposed_starts_at,proposed_ends_at").eq("id", id).maybeSingle();
    if (!offer.data || offer.data.recipient_tenant_id !== profile.tenantId) return json({ error: "Werbeangebot nicht gefunden" }, { status: 404 });
    if (offer.data.status !== "pending") return json({ error: "Dieses Angebot wurde bereits beantwortet" }, { status: 409 });
    if (decision === "decline") {
      const declined = await admin.from("tenant_partner_content_offers").update({ status: "declined", responded_by: profile.userId, responded_at: now, updated_at: now }).eq("id", id).eq("status", "pending");
      if (declined.error) return json({ error: "Entscheidung konnte nicht gespeichert werden" }, { status: 400 });
      return json({ ok: true });
    }
    const source = await admin.from("tenant_content").select("id,title,content_type,status,payload,asset_path").eq("id", offer.data.source_content_id).eq("tenant_id", offer.data.sender_tenant_id).in("status", ["approved", "published"]).maybeSingle();
    const sourcePayload = source.data?.payload || {};
    const ready = sourcePayload.uploadState === "ready" && (!sourcePayload.processingState || sourcePayload.processingState === "ready");
    if (!source.data || !source.data.asset_path || !ready) return json({ error: "Der Partnerinhalt ist derzeit nicht mehr verfügbar" }, { status: 409 });
    const sender = await admin.from("tenants").select("name").eq("id", offer.data.sender_tenant_id).maybeSingle();
    const copiedPayload = {
      ...sourcePayload,
      partnerSource: {
        offerId: id,
        tenantId: offer.data.sender_tenant_id,
        tenantName: sender.data?.name || "Partnerbetrieb",
        contentId: source.data.id,
        sharedAsset: true,
        proposedStartsAt: offer.data.proposed_starts_at,
        proposedEndsAt: offer.data.proposed_ends_at,
      },
    };
    const copied = await admin.from("tenant_content").insert({ tenant_id: profile.tenantId, title: `${source.data.title} · Partner ${sender.data?.name || "Betrieb"}`, content_type: source.data.content_type, status: "approved", payload: copiedPayload, asset_path: source.data.asset_path, created_by: profile.userId, updated_by: profile.userId }).select("id").single();
    if (copied.error) return json({ error: "Partnerinhalt konnte nicht in Ihre Mediathek übernommen werden" }, { status: 400 });
    const accepted = await admin.from("tenant_partner_content_offers").update({ status: "accepted", recipient_content_id: copied.data.id, responded_by: profile.userId, responded_at: now, updated_at: now }).eq("id", id).eq("status", "pending");
    if (accepted.error) {
      await admin.from("tenant_content").delete().eq("id", copied.data.id).eq("tenant_id", profile.tenantId);
      return json({ error: "Übernahme konnte nicht abgeschlossen werden" }, { status: 400 });
    }
    await admin.from("tenant_audit_log").insert({ tenant_id: profile.tenantId, actor_user_id: profile.userId, action: "partner_content_accepted", entity_type: "partner_offer", entity_id: id, metadata: { sourceContentId: source.data.id, recipientContentId: copied.data.id } });
    return json({ ok: true, contentId: copied.data.id });
  }

  if (action === "withdraw_partner_offer") {
    const id = cleanText(body.id, 80);
    const offer = await admin.from("tenant_partner_content_offers").select("id,sender_tenant_id,status").eq("id", id).maybeSingle();
    if (!offer.data || offer.data.sender_tenant_id !== profile.tenantId) return json({ error: "Werbeangebot nicht gefunden" }, { status: 404 });
    if (offer.data.status !== "pending") return json({ error: "Nur offene Angebote können zurückgezogen werden" }, { status: 409 });
    const updated = await admin.from("tenant_partner_content_offers").update({ status: "withdrawn", updated_at: now }).eq("id", id).eq("status", "pending");
    if (updated.error) return json({ error: "Angebot konnte nicht zurückgezogen werden" }, { status: 400 });
    return json({ ok: true });
  }

  return json({ error: "Unbekannte Partneraktion" }, { status: 400 });
}
