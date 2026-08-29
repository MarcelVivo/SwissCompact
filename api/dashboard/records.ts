import { authorizeDashboard, isResponse, writeAudit } from "../_lib/dashboard/auth.js";
import { cleanText, json, validEmail, validatePublicPost } from "../_lib/assistant/security.js";
import { escapeHtml } from "../_lib/assistant/spamGuard.js";
import { createQuotePdf } from "../_lib/dashboard/documents.js";
import { createHash, randomBytes } from "node:crypto";
import { Resend } from "resend";
import { getPublicQuote, postPublicQuote } from "../_lib/dashboard/quote-public.js";

type Payload = Record<string, unknown>;

function amount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(Math.min(parsed, 1_000_000_000) * 100) / 100) : 0;
}

function optionalEmail(value: unknown): string | null | undefined {
  const email = cleanText(value, 200).toLowerCase();
  if (!email) return null;
  return validEmail(email) ? email : undefined;
}

function optionalDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const paymentActions = {
  deposit_50: { field: "deposit_received", nextStage: "planning", label: "50-%-Anzahlung" },
  installation_30: { field: "installation_payment_received", nextStage: "configuration", label: "30-%-Montagezahlung" },
  acceptance_20: { field: "final_payment_received", nextStage: "completed", label: "20-%-Schlusszahlung" },
} as const;

function approvalColumn(email: string): "marcel_approved_at" | "thomas_approved_at" | null {
  if (email === "kontakt@swisscompact.com") return "marcel_approved_at";
  if (email === "thomas.peter@swisscompact.com") return "thomas_approved_at";
  return null;
}

function quoteItems(value: unknown): Array<{ description: string; quantity: number; unit: string; unitPriceChf: number; totalChf: number }> | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) return null;
  const parsed = value.map((entry) => {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const description = cleanText(item.description, 300);
    const quantity = Math.min(100_000, Math.max(0.01, Math.round(Number(item.quantity) * 100) / 100));
    const unit = cleanText(item.unit, 40) || "Stk.";
    const unitPriceChf = amount(item.unitPriceChf);
    return { description, quantity, unit, unitPriceChf, totalChf: Math.round(quantity * unitPriceChf * 100) / 100 };
  });
  return parsed.every((item) => item.description && Number.isFinite(item.quantity) && item.unitPriceChf >= 0) ? parsed : null;
}

export async function POST(request: Request): Promise<Response> {
  if (new URL(request.url).searchParams.get("public") === "quote") return postPublicQuote(request);
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
    const email = optionalEmail(body.email);
    if (email === undefined) return json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
    const record = {
      company_name: cleanText(body.companyName, 200),
      contact_name: cleanText(body.contactName, 200) || null,
      email,
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

  if (action === "update_client") {
    const id = cleanText(body.id, 80);
    const email = optionalEmail(body.email);
    const lifecycle = cleanText(body.lifecycle, 40);
    if (!id) return json({ error: "Kunde fehlt" }, { status: 400 });
    if (email === undefined) return json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
    if (!["lead", "prospect", "customer", "inactive"].includes(lifecycle)) {
      return json({ error: "Ungültiger Kundenstatus" }, { status: 400 });
    }
    const previous = await client.from("clients").select("*").eq("id", id).single();
    if (previous.error) return json({ error: previous.error.message }, { status: 404 });
    const update = {
      company_name: cleanText(body.companyName, 200),
      contact_name: cleanText(body.contactName, 200) || null,
      email,
      phone: cleanText(body.phone, 80) || null,
      address_line: cleanText(body.addressLine, 240) || null,
      postal_code: cleanText(body.postalCode, 30) || null,
      city: cleanText(body.city, 120) || null,
      lifecycle,
      notes: cleanText(body.notes, 20_000) || null,
      updated_at: new Date().toISOString(),
    };
    if (!update.company_name) return json({ error: "Firmenname fehlt" }, { status: 400 });
    const result = await client.from("clients").update(update).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "update", "client", id, previous.data, result.data);
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

  if (action === "update_opportunity") {
    const id = cleanText(body.id, 80);
    const stage = cleanText(body.stage, 80);
    const ownerArea = cleanText(body.ownerArea, 40);
    const probability = Math.min(100, Math.max(0, Math.round(Number(body.probability) || 0)));
    const allowedStages = [
      "request","qualification","consulting","customer_decision","quote","confirmed","deposit_50","planning",
      "hardware_concept","software_development","procurement","installation","installation_30","configuration",
      "acceptance","final_invoice_20","completed","maintenance","paused","lost","cancelled",
    ];
    if (!id || !allowedStages.includes(stage)) return json({ error: "Ungültige Chance" }, { status: 400 });
    if (!["marcel", "thomas", "shared", "ai"].includes(ownerArea)) return json({ error: "Ungültige Verantwortung" }, { status: 400 });
    const previous = await client.from("opportunities").select("*").eq("id", id).single();
    if (previous.error) return json({ error: previous.error.message }, { status: 404 });
    const update = {
      client_id: typeof body.clientId === "string" && body.clientId ? body.clientId : null,
      title: cleanText(body.title, 240),
      stage,
      owner_area: ownerArea,
      value_chf: amount(body.valueChf),
      probability,
      expected_close: typeof body.expectedClose === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.expectedClose) ? body.expectedClose : null,
      next_action: cleanText(body.nextAction, 1000) || null,
      next_action_at: optionalDate(body.nextActionAt),
      updated_at: new Date().toISOString(),
    };
    if (!update.title) return json({ error: "Titel fehlt" }, { status: 400 });
    const result = await client.from("opportunities").update(update).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "update", "opportunity", id, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "create_quote" || action === "update_quote") {
    const items = quoteItems(body.items);
    const validUntil = typeof body.validUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.validUntil) ? body.validUntil : null;
    if (!items) return json({ error: "Mindestens eine gültige Offertenposition ist erforderlich" }, { status: 400 });
    if (!validUntil) return json({ error: "Gültigkeitsdatum fehlt" }, { status: 400 });
    const subtotal = Math.round(items.reduce((sum, item) => sum + item.totalChf, 0) * 100) / 100;
    const record = {
      client_id: typeof body.clientId === "string" && body.clientId ? body.clientId : null,
      opportunity_id: typeof body.opportunityId === "string" && body.opportunityId ? body.opportunityId : null,
      status: "draft",
      currency: "CHF",
      subtotal,
      total: subtotal,
      valid_until: validUntil,
      items,
      terms: cleanText(body.terms, 5000) || "Zahlungsplan Projektauftrag: 50 % vor Projektstart, 30 % bei Montagebeginn und 20 % nach unterzeichneter Kundenabnahme. Zahlungsziel 14 Tage. Software-Abonnements werden separat monatlich verrechnet.",
      updated_at: new Date().toISOString(),
    };
    if (!record.client_id) return json({ error: "Kunde fehlt" }, { status: 400 });
    if (record.opportunity_id) {
      const opportunity = await client.from("opportunities").select("client_id").eq("id", record.opportunity_id).single();
      if (opportunity.error || opportunity.data.client_id !== record.client_id) return json({ error: "Chance und Kunde passen nicht zusammen" }, { status: 400 });
    }
    if (action === "create_quote") {
      const result = await client.from("quotes").insert(record).select("*").single();
      if (result.error) return json({ error: result.error.message }, { status: 400 });
      if (record.opportunity_id) await client.from("opportunities").update({ stage: "quote", value_chf: subtotal, probability: 60, updated_at: new Date().toISOString() }).eq("id", record.opportunity_id);
      await writeAudit(client, profile, "create", "quote", result.data.id, undefined, result.data);
      return json({ ok: true, record: result.data });
    }
    const id = cleanText(body.id, 80);
    const previous = await client.from("quotes").select("*").eq("id", id).single();
    if (previous.error) return json({ error: "Offerte nicht gefunden" }, { status: 404 });
    if (["sent", "viewed", "accepted", "declined", "expired"].includes(previous.data.status)) return json({ error: "Eine versendete oder abgeschlossene Offerte kann nicht mehr verändert werden" }, { status: 409 });
    const result = await client.from("quotes").update(record).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await client.from("approvals").update({ invalidated_at: new Date().toISOString() }).eq("entity_id", id).eq("action", "quote_approval").is("invalidated_at", null);
    if (record.opportunity_id) await client.from("opportunities").update({ value_chf: subtotal, updated_at: new Date().toISOString() }).eq("id", record.opportunity_id);
    await writeAudit(client, profile, "update", "quote", id, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "request_quote_approval") {
    const quoteId = cleanText(body.quoteId, 80);
    const column = approvalColumn(profile.email);
    if (!quoteId || !column) return json({ error: "Ungültige Offertenfreigabe" }, { status: 400 });
    const quote = await client.from("quotes").select("*").eq("id", quoteId).single();
    if (quote.error) return json({ error: "Offerte nicht gefunden" }, { status: 404 });
    if (!["draft", "approval"].includes(quote.data.status)) return json({ error: "Diese Offerte kann nicht freigegeben werden" }, { status: 409 });
    const contentHash = createHash("sha256").update(JSON.stringify({ clientId: quote.data.client_id, opportunityId: quote.data.opportunity_id, items: quote.data.items, total: quote.data.total, validUntil: quote.data.valid_until, terms: quote.data.terms, updatedAt: quote.data.updated_at })).digest("hex");
    const existing = await client.from("approvals").select("*").eq("entity_id", quoteId).eq("action", "quote_approval").is("invalidated_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing.error) return json({ error: existing.error.message }, { status: 400 });
    let current = existing.data;
    if (current && current.content_hash !== contentHash) {
      await client.from("approvals").update({ invalidated_at: new Date().toISOString() }).eq("id", current.id);
      current = null;
    }
    if (!current) {
      const created = await client.from("approvals").insert({ entity_type: "quote", entity_id: quoteId, action: "quote_approval", content_hash: contentHash, requested_by: profile.userId, [column]: new Date().toISOString() }).select("*").single();
      if (created.error) return json({ error: created.error.message }, { status: 400 });
      current = created.data;
      await client.from("quotes").update({ status: "approval" }).eq("id", quoteId);
    } else if (!current[column]) {
      const approved = await client.from("approvals").update({ [column]: new Date().toISOString() }).eq("id", current.id).select("*").single();
      if (approved.error) return json({ error: approved.error.message }, { status: 400 });
      current = approved.data;
    }
    const fullyApproved = Boolean(current.marcel_approved_at && current.thomas_approved_at);
    if (fullyApproved && !current.executed_at) await client.from("approvals").update({ executed_at: new Date().toISOString() }).eq("id", current.id);
    await writeAudit(client, profile, fullyApproved ? "dual_approval_executed" : "approval_recorded", "quote", quoteId, undefined, { approvalId: current.id, total: quote.data.total, fullyApproved });
    return json({ ok: true, approval: current, approved: fullyApproved });
  }

  if (action === "publish_quote") {
    const quoteId = cleanText(body.quoteId, 80);
    if (!quoteId) return json({ error: "Offerte fehlt" }, { status: 400 });
    const quote = await client.from("quotes").select("*").eq("id", quoteId).single();
    if (quote.error) return json({ error: "Offerte nicht gefunden" }, { status: 404 });
    if (["accepted", "declined", "expired"].includes(quote.data.status)) return json({ error: "Diese Offerte ist bereits abgeschlossen" }, { status: 409 });
    const approval = await client.from("approvals").select("*").eq("entity_id", quoteId).eq("action", "quote_approval").is("invalidated_at", null).not("executed_at", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (approval.error || !approval.data?.marcel_approved_at || !approval.data?.thomas_approved_at) return json({ error: "Vor dem Versand müssen Marcel und Thomas freigeben" }, { status: 409 });
    const customer = await client.from("clients").select("*").eq("id", quote.data.client_id).single();
    if (customer.error || !customer.data?.email || !validEmail(customer.data.email)) return json({ error: "Beim Kunden ist keine gültige E-Mail-Adresse hinterlegt" }, { status: 409 });

    const pdf = await createQuotePdf(quote.data, customer.data);
    const documentHash = createHash("sha256").update(pdf).digest("hex");
    const pdfPath = `quotes/${quote.data.quote_number}/${documentHash}.pdf`;
    const upload = await client.storage.from("swisscompact-documents").upload(pdfPath, pdf, { contentType: "application/pdf", upsert: false });
    if (upload.error && !/already exists/i.test(upload.error.message)) return json({ error: `PDF konnte nicht gespeichert werden: ${upload.error.message}` }, { status: 503 });

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const validUntilEnd = new Date(`${quote.data.valid_until}T23:59:59.999+02:00`);
    const maximum = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    const expiresAt = new Date(Math.min(validUntilEnd.getTime(), maximum.getTime()));
    if (expiresAt.getTime() <= Date.now()) return json({ error: "Das Gültigkeitsdatum der Offerte ist bereits abgelaufen" }, { status: 409 });
    await client.from("quote_access_tokens").update({ revoked_at: new Date().toISOString() }).eq("quote_id", quoteId).is("revoked_at", null).is("accepted_at", null);
    const access = await client.from("quote_access_tokens").insert({ quote_id: quoteId, token_hash: tokenHash, recipient_email: customer.data.email.toLowerCase(), expires_at: expiresAt.toISOString(), created_by: profile.userId }).select("id").single();
    if (access.error) return json({ error: access.error.message }, { status: 400 });

    const origin = new URL(request.url).origin;
    const acceptanceUrl = `${origin}/offerte/${token}`;
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      await client.from("quote_access_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", access.data.id);
      return json({ error: "RESEND_API_KEY fehlt. Die Offerte wurde sicher erstellt, aber noch nicht versendet." }, { status: 503 });
    }
    const mail = await new Resend(resendKey).emails.send({
      from: "SwissCompact <kontakt@swisscompact.com>",
      to: customer.data.email,
      replyTo: "kontakt@swisscompact.com",
      subject: `Ihre Offerte ${quote.data.quote_number} von SwissCompact`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#18181b"><p style="color:#c8102e;font-weight:800;letter-spacing:.12em">SWISSCOMPACT</p><h1 style="font-size:30px">Ihre Offerte ist bereit.</h1><p>Guten Tag ${escapeHtml(customer.data.contact_name || customer.data.company_name)},</p><p>Sie können die Offerte <strong>${escapeHtml(quote.data.quote_number)}</strong> über den sicheren Link ansehen und digital annehmen.</p><p style="margin:30px 0"><a href="${acceptanceUrl}" style="display:inline-block;padding:15px 22px;background:#d70b31;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Offerte sicher öffnen</a></p><p style="font-size:13px;color:#666">Der Link ist persönlich, nicht übertragbar und bis ${escapeHtml(expiresAt.toLocaleDateString("de-CH"))} gültig.</p><p>Freundliche Grüsse<br>Marcel Spahr und Thomas Peter<br>SwissCompact</p></div>`,
      attachments: [{ filename: `${quote.data.quote_number}.pdf`, content: Buffer.from(pdf).toString("base64") }],
    });
    if (mail.error) {
      await client.from("quote_access_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", access.data.id);
      return json({ error: `E-Mail-Versand fehlgeschlagen: ${mail.error.message}` }, { status: 503 });
    }
    const updated = await client.from("quotes").update({ status: "sent", immutable_pdf_path: pdfPath, document_hash: documentHash, updated_at: new Date().toISOString() }).eq("id", quoteId).select("*").single();
    if (updated.error) return json({ error: updated.error.message }, { status: 400 });
    await writeAudit(client, profile, "quote_published", "quote", quoteId, quote.data, { status: "sent", documentHash, recipient: customer.data.email, accessId: access.data.id });
    return json({ ok: true, record: updated.data, acceptanceUrl, expiresAt: expiresAt.toISOString() });
  }

  if (action === "create_project_from_opportunity") {
    const opportunityId = cleanText(body.opportunityId, 80);
    const allowedStages = ["confirmed", "deposit_50", "planning", "hardware_concept", "software_development", "procurement", "installation", "installation_30", "configuration", "acceptance", "final_invoice_20"];
    const opportunity = await client.from("opportunities").select("*").eq("id", opportunityId).single();
    if (opportunity.error) return json({ error: "Auftrag nicht gefunden" }, { status: 404 });
    if (!opportunity.data.client_id) return json({ error: "Vor der Projektanlage muss ein Kunde zugeordnet sein" }, { status: 400 });
    if (!allowedStages.includes(opportunity.data.stage)) return json({ error: "Ein Projekt kann erst nach bestätigtem Auftrag angelegt werden" }, { status: 409 });
    const existing = await client.from("projects").select("id,order_number").eq("opportunity_id", opportunityId).maybeSingle();
    if (existing.data) return json({ error: `Projekt ${existing.data.order_number} existiert bereits` }, { status: 409 });
    const profiles = await client.from("dashboard_profiles").select("user_id,email").eq("active", true);
    if (profiles.error) return json({ error: profiles.error.message }, { status: 400 });
    const marcel = profiles.data?.find((entry) => entry.email === "kontakt@swisscompact.com")?.user_id ?? null;
    const thomas = profiles.data?.find((entry) => entry.email === "thomas.peter@swisscompact.com")?.user_id ?? null;
    const project = await client.from("projects").insert({
      opportunity_id: opportunityId,
      client_id: opportunity.data.client_id,
      title: opportunity.data.title,
      status: "planning",
      software_owner: marcel,
      hardware_owner: thomas,
      starts_on: typeof body.startsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startsOn) ? body.startsOn : null,
      target_completion: typeof body.targetCompletion === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.targetCompletion) ? body.targetCompletion : null,
    }).select("*").single();
    if (project.error) return json({ error: project.error.message }, { status: 400 });
    await Promise.all([
      client.from("opportunities").update({ stage: "deposit_50", updated_at: new Date().toISOString() }).eq("id", opportunityId),
      client.from("clients").update({ lifecycle: "customer", updated_at: new Date().toISOString() }).eq("id", opportunity.data.client_id),
      client.from("tasks").insert({ project_id: project.data.id, title: "50-%-Anzahlung prüfen und gemeinsam bestätigen", responsibility: "shared", priority: "urgent", status: "open" }),
    ]);
    await writeAudit(client, profile, "create_from_order", "project", project.data.id, opportunity.data, project.data);
    return json({ ok: true, record: project.data });
  }

  if (action === "update_project") {
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 40);
    if (!id || !["planning", "active", "blocked", "acceptance", "completed", "cancelled"].includes(status)) {
      return json({ error: "Ungültiger Projektstatus" }, { status: 400 });
    }
    const previous = await client.from("projects").select("*").eq("id", id).single();
    if (previous.error) return json({ error: previous.error.message }, { status: 404 });
    if (status === "active" && !previous.data.deposit_received) return json({ error: "Projektstart ist erst nach bestätigter 50-%-Anzahlung möglich" }, { status: 409 });
    if (status === "acceptance" && !previous.data.installation_payment_received) return json({ error: "Abnahme ist erst nach bestätigter Montagezahlung möglich" }, { status: 409 });
    if (status === "completed" && !previous.data.final_payment_received) return json({ error: "Abschluss ist erst nach bestätigter Schlusszahlung möglich" }, { status: 409 });
    const allowedOwners = await client.from("dashboard_profiles").select("user_id").eq("active", true);
    const ownerIds = new Set((allowedOwners.data ?? []).map((entry) => entry.user_id));
    const softwareOwner = typeof body.softwareOwner === "string" && ownerIds.has(body.softwareOwner) ? body.softwareOwner : null;
    const hardwareOwner = typeof body.hardwareOwner === "string" && ownerIds.has(body.hardwareOwner) ? body.hardwareOwner : null;
    const update = {
      title: cleanText(body.title, 240),
      status,
      software_owner: softwareOwner,
      hardware_owner: hardwareOwner,
      starts_on: typeof body.startsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startsOn) ? body.startsOn : null,
      target_completion: typeof body.targetCompletion === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.targetCompletion) ? body.targetCompletion : null,
      updated_at: new Date().toISOString(),
    };
    if (!update.title) return json({ error: "Projekttitel fehlt" }, { status: 400 });
    const result = await client.from("projects").update(update).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await client.from("approvals").update({ invalidated_at: new Date().toISOString() }).eq("entity_id", id).is("executed_at", null).is("invalidated_at", null);
    await writeAudit(client, profile, "update", "project", id, previous.data, result.data);
    return json({ ok: true, record: result.data });
  }

  if (action === "request_project_payment_approval" || action === "approve_project_payment") {
    const projectId = cleanText(body.projectId, 80);
    const payment = cleanText(body.payment, 40) as keyof typeof paymentActions;
    const config = paymentActions[payment];
    const column = approvalColumn(profile.email);
    if (!projectId || !config || !column) return json({ error: "Ungültige Zahlungsfreigabe" }, { status: 400 });
    const project = await client.from("projects").select("*").eq("id", projectId).single();
    if (project.error) return json({ error: "Projekt nicht gefunden" }, { status: 404 });
    if (project.data[config.field]) return json({ ok: true, alreadyExecuted: true });
    if (payment === "installation_30" && !project.data.deposit_received) return json({ error: "Zuerst muss die 50-%-Anzahlung bestätigt werden" }, { status: 409 });
    if (payment === "installation_30" && project.data.opportunity_id) {
      const opportunity = await client.from("opportunities").select("stage").eq("id", project.data.opportunity_id).single();
      const montageStages = ["installation", "installation_30", "configuration", "acceptance", "final_invoice_20", "completed", "maintenance"];
      if (opportunity.error || !montageStages.includes(opportunity.data.stage)) {
        return json({ error: "Die 30-%-Zahlung wird erst zum Beginn der Montage freigeschaltet" }, { status: 409 });
      }
    }
    if (payment === "acceptance_20" && (!project.data.installation_payment_received || project.data.status !== "acceptance")) {
      return json({ error: "Schlusszahlung erst nach Montagezahlung und Kundenabnahme bestätigen" }, { status: 409 });
    }
    const contentHash = createHash("sha256").update(`${projectId}:${payment}:${project.data.updated_at}`).digest("hex");
    let approval;
    if (action === "approve_project_payment") {
      const approvalId = cleanText(body.approvalId, 80);
      approval = await client.from("approvals").select("*").eq("id", approvalId).eq("entity_id", projectId).eq("action", payment).is("invalidated_at", null).single();
      if (approval.error) return json({ error: "Freigabe nicht gefunden oder nicht mehr gültig" }, { status: 404 });
      if (approval.data.content_hash !== contentHash) {
        await client.from("approvals").update({ invalidated_at: new Date().toISOString() }).eq("id", approval.data.id);
        return json({ error: "Das Projekt wurde seit der ersten Freigabe geändert. Bitte neu freigeben." }, { status: 409 });
      }
    } else {
      const existing = await client.from("approvals").select("*").eq("entity_id", projectId).eq("action", payment).is("invalidated_at", null).is("executed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existing.error) return json({ error: existing.error.message }, { status: 400 });
      if (existing.data?.content_hash === contentHash) approval = existing;
      else {
        if (existing.data) await client.from("approvals").update({ invalidated_at: new Date().toISOString() }).eq("id", existing.data.id);
        approval = await client.from("approvals").insert({ entity_type: "project", entity_id: projectId, action: payment, content_hash: contentHash, requested_by: profile.userId, [column]: new Date().toISOString() }).select("*").single();
      }
    }
    if (approval.error || !approval.data) return json({ error: approval.error?.message || "Freigabe konnte nicht erstellt werden" }, { status: 400 });
    let current = approval.data;
    if (!current[column]) {
      const updated = await client.from("approvals").update({ [column]: new Date().toISOString() }).eq("id", current.id).select("*").single();
      if (updated.error) return json({ error: updated.error.message }, { status: 400 });
      current = updated.data;
    }
    const fullyApproved = Boolean(current.marcel_approved_at && current.thomas_approved_at);
    if (fullyApproved && !current.executed_at) {
      const projectUpdate: Record<string, unknown> = { [config.field]: true, updated_at: new Date().toISOString() };
      if (payment === "deposit_50") projectUpdate.status = "active";
      if (payment === "acceptance_20") projectUpdate.status = "completed";
      const executed = await client.from("projects").update(projectUpdate).eq("id", projectId).select("*").single();
      if (executed.error) return json({ error: executed.error.message }, { status: 400 });
      await client.from("approvals").update({ executed_at: new Date().toISOString() }).eq("id", current.id);
      await client.from("invoices").update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("project_id", projectId).eq("installment", payment).in("status", ["draft", "approval", "sent", "partially_paid", "overdue"]);
      if (project.data.opportunity_id) await client.from("opportunities").update({ stage: config.nextStage, updated_at: new Date().toISOString() }).eq("id", project.data.opportunity_id);
      if (payment === "deposit_50") await client.from("tasks").insert([
        { project_id: projectId, title: "Projekt-Kickoff und Detailplanung durchführen", responsibility: "marcel", priority: "high", status: "open" },
        { project_id: projectId, title: "Hardware- und Montagekonzept ausarbeiten", responsibility: "thomas", priority: "high", status: "open" },
        { project_id: projectId, title: "Software-, UX- und Inhaltskonzept ausarbeiten", responsibility: "marcel", priority: "high", status: "open" },
      ]);
      if (payment === "deposit_50") await client.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("project_id", projectId).eq("title", "50-%-Anzahlung prüfen und gemeinsam bestätigen");
      await writeAudit(client, profile, "dual_approval_executed", "project_payment", projectId, project.data, { payment, label: config.label });
    } else {
      await writeAudit(client, profile, "approval_recorded", "project_payment", projectId, undefined, { payment, approvalId: current.id, fullyApproved });
    }
    return json({ ok: true, approval: current, executed: fullyApproved });
  }

  if (action === "invoice_document_url") {
    const invoiceId = cleanText(body.invoiceId, 80);
    if (!invoiceId) return json({ error: "Rechnung fehlt" }, { status: 400 });
    const invoice = await client.from("invoices").select("id,invoice_number,immutable_pdf_path").eq("id", invoiceId).single();
    if (invoice.error || !invoice.data?.immutable_pdf_path) return json({ error: "Für diese Rechnung ist noch kein PDF verfügbar" }, { status: 404 });
    const signed = await client.storage.from("swisscompact-documents").createSignedUrl(invoice.data.immutable_pdf_path, 10 * 60);
    if (signed.error || !signed.data?.signedUrl) return json({ error: "Rechnungsdokument konnte nicht geöffnet werden" }, { status: 503 });
    await writeAudit(client, profile, "document_opened", "invoice", invoiceId, undefined, { invoiceNumber: invoice.data.invoice_number });
    return json({ ok: true, url: signed.data.signedUrl, expiresIn: 600 });
  }

  if (action === "create_task") {
    const record = {
      title: cleanText(body.title, 240),
      description: cleanText(body.description, 1200) || null,
      responsibility: ["marcel", "thomas", "shared", "ai"].includes(String(body.responsibility)) ? body.responsibility : "shared",
      status: "open",
      priority: ["low", "normal", "high", "urgent"].includes(String(body.priority)) ? body.priority : "normal",
      due_at: optionalDate(body.dueAt),
      project_id: typeof body.projectId === "string" && body.projectId ? body.projectId : null,
      opportunity_id: typeof body.opportunityId === "string" && body.opportunityId ? body.opportunityId : null,
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

  if (action === "update_task_status") {
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 40);
    if (!id || !["open", "in_progress", "waiting", "done", "cancelled"].includes(status)) return json({ error: "Ungültiger Aufgabenstatus" }, { status: 400 });
    const previous = await client.from("tasks").select("*").eq("id", id).single();
    if (previous.error) return json({ error: previous.error.message }, { status: 404 });
    const result = await client.from("tasks").update({ status, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", id).select("*").single();
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    await writeAudit(client, profile, "status_change", "task", id, previous.data, result.data);
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

export async function GET(request: Request): Promise<Response> {
  if (new URL(request.url).searchParams.get("public") === "quote") return getPublicQuote(request);
  return json({ error: "Nicht gefunden" }, { status: 404 });
}
