import { createHash } from "node:crypto";
import { Resend } from "resend";
import { dashboardSupabase } from "./auth.js";
import { createDepositInvoicePdf } from "./documents.js";
import { cleanText, clientAddress, json, rateLimit, validEmail, validatePublicPost } from "../assistant/security.js";
import { escapeHtml } from "../assistant/spamGuard.js";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const tokenFrom = (request: Request) => cleanText(new URL(request.url).searchParams.get("token"), 100);
const relation = (value: any) => Array.isArray(value) ? value[0] : value;

async function accessFor(request: Request) {
  const token = tokenFrom(request);
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return { error: json({ error: "Ungültiger Offertenlink" }, { status: 404 }) };
  const client = dashboardSupabase();
  if (!client) return { error: json({ error: "Service vorübergehend nicht verfügbar" }, { status: 503 }) };
  const access = await client.from("quote_access_tokens").select("*").eq("token_hash", tokenHash(token)).maybeSingle();
  if (access.error || !access.data || access.data.revoked_at) return { error: json({ error: "Dieser Offertenlink ist nicht mehr gültig" }, { status: 404 }) };
  if (new Date(access.data.expires_at).getTime() <= Date.now()) return { error: json({ error: "Diese Offerte ist abgelaufen" }, { status: 410 }) };
  return { client, access: access.data };
}

export async function getPublicQuote(request: Request): Promise<Response> {
  const limited = rateLimit(request, { key: "quote-view", limit: 60, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const resolved = await accessFor(request);
  if (resolved.error) return resolved.error;
  const { client, access } = resolved;
  const result = await client.from("quotes").select("id,quote_number,status,currency,total,valid_until,items,terms,immutable_pdf_path,document_hash,accepted_by_name,accepted_by_email,accepted_at,client:clients(company_name,contact_name),opportunity:opportunities(title)").eq("id", access.quote_id).single();
  if (result.error || !result.data?.immutable_pdf_path) return json({ error: "Offertendokument nicht verfügbar" }, { status: 404 });
  const quote = result.data;
  const signed = await client.storage.from("swisscompact-documents").createSignedUrl(quote.immutable_pdf_path, 10 * 60);
  if (!access.accepted_at && ["sent", "viewed"].includes(quote.status)) {
    const now = new Date().toISOString();
    await Promise.all([
      client.from("quote_access_tokens").update({ last_viewed_at: now }).eq("id", access.id),
      quote.status === "sent" ? client.from("quotes").update({ status: "viewed" }).eq("id", quote.id) : Promise.resolve(),
    ]);
  }
  return json({
    quote: {
      quoteNumber: quote.quote_number,
      status: quote.status === "sent" ? "viewed" : quote.status,
      currency: quote.currency,
      total: quote.total,
      validUntil: quote.valid_until,
      items: quote.items,
      terms: quote.terms,
      documentHash: quote.document_hash,
      acceptedByName: quote.accepted_by_name,
      acceptedAt: quote.accepted_at,
      companyName: relation(quote.client)?.company_name,
      contactName: relation(quote.client)?.contact_name,
      projectTitle: relation(quote.opportunity)?.title,
      pdfUrl: signed.data?.signedUrl || null,
    },
    expiresAt: access.expires_at,
  });
}

export async function postPublicQuote(request: Request): Promise<Response> {
  const guarded = validatePublicPost(request, { key: "quote-accept", limit: 8, windowMs: 30 * 60_000, contentTypes: ["application/json"], maxBytes: 8_000 });
  if (guarded) return guarded;
  const resolved = await accessFor(request);
  if (resolved.error) return resolved.error;
  const { client, access } = resolved;
  if (access.accepted_at) return json({ error: "Diese Offerte wurde bereits angenommen" }, { status: 409 });
  const body = await request.json() as Record<string, unknown>;
  const name = cleanText(body.name, 200);
  const email = cleanText(body.email, 200).toLowerCase();
  if (!name || !validEmail(email) || body.confirm !== true) return json({ error: "Name, gültige E-Mail und Bestätigung sind erforderlich" }, { status: 400 });
  if (email !== String(access.recipient_email).toLowerCase()) return json({ error: "Die E-Mail-Adresse stimmt nicht mit dem persönlichen Offertenlink überein" }, { status: 403 });

  const quoteResult = await client.from("quotes").select("*,client:clients(*),opportunity:opportunities(*)").eq("id", access.quote_id).single();
  if (quoteResult.error || !["sent", "viewed"].includes(quoteResult.data.status)) return json({ error: "Diese Offerte kann nicht mehr angenommen werden" }, { status: 409 });
  const quote = quoteResult.data; const customer = relation(quote.client); const opportunity = relation(quote.opportunity);
  const acceptedAt = new Date().toISOString();
  const ip = clientAddress(request);
  const accepted = await client.from("quotes").update({ status: "accepted", accepted_by_name: name, accepted_by_email: email, accepted_at: acceptedAt, acceptance_ip: ip === "unknown" ? null : ip, updated_at: acceptedAt }).eq("id", quote.id).in("status", ["sent", "viewed"]).select("id").maybeSingle();
  if (accepted.error || !accepted.data) return json({ error: "Die Offerte wurde gleichzeitig verarbeitet. Bitte laden Sie die Seite neu." }, { status: 409 });
  await client.from("quote_access_tokens").update({ accepted_at: acceptedAt }).eq("id", access.id).is("accepted_at", null);

  let project = await client.from("projects").select("*").eq("quote_id", quote.id).maybeSingle();
  if (!project.data) {
    const profiles = await client.from("dashboard_profiles").select("user_id,email").eq("active", true);
    const created = await client.from("projects").insert({
      quote_id: quote.id,
      opportunity_id: quote.opportunity_id,
      client_id: quote.client_id,
      title: opportunity?.title || `Projekt ${quote.quote_number}`,
      status: "planning",
      software_owner: profiles.data?.find((entry) => entry.email === "kontakt@swisscompact.com")?.user_id ?? null,
      hardware_owner: profiles.data?.find((entry) => entry.email === "thomas.peter@swisscompact.com")?.user_id ?? null,
      payment_plan: { deposit: 50, installation: 30, acceptance: 20 },
    }).select("*").single();
    project = created;
    if (project.error) project = await client.from("projects").select("*").eq("quote_id", quote.id).maybeSingle();
  }
  if (project.error || !project.data) return json({ error: "Annahme gespeichert; die Projektanlage muss im Dashboard geprüft werden" }, { status: 202 });

  const today = new Date(); const due = new Date(today); due.setDate(due.getDate() + 14);
  let invoice = await client.from("invoices").select("*").eq("quote_id", quote.id).eq("installment", "deposit_50").maybeSingle();
  if (!invoice.data) {
    const created = await client.from("invoices").insert({ quote_id: quote.id, project_id: project.data.id, client_id: quote.client_id, installment: "deposit_50", status: "draft", amount: Math.round(Number(quote.total) * 50) / 100, currency: "CHF", issued_on: today.toISOString().slice(0, 10), due_on: due.toISOString().slice(0, 10) }).select("*").single();
    invoice = created;
    if (invoice.error) invoice = await client.from("invoices").select("*").eq("quote_id", quote.id).eq("installment", "deposit_50").maybeSingle();
  }
  if (invoice.error || !invoice.data) return json({ error: "Annahme und Projekt gespeichert; die Anzahlungsrechnung muss im Dashboard geprüft werden" }, { status: 202 });

  const invoicePdf = await createDepositInvoicePdf(invoice.data, quote, customer);
  const invoiceHash = createHash("sha256").update(invoicePdf).digest("hex");
  const invoicePath = `invoices/${invoice.data.invoice_number}/${invoiceHash}.pdf`;
  const upload = await client.storage.from("swisscompact-documents").upload(invoicePath, invoicePdf, { contentType: "application/pdf", upsert: false });
  if (!upload.error || /already exists/i.test(upload.error?.message || "")) await client.from("invoices").update({ immutable_pdf_path: invoicePath, document_hash: invoiceHash }).eq("id", invoice.data.id);

  let invoiceSent = false;
  if (process.env.RESEND_API_KEY) {
    const mail = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: "SwissCompact <kontakt@swisscompact.com>", to: email, replyTo: "kontakt@swisscompact.com",
      subject: `Bestätigung und Anzahlungsrechnung ${invoice.data.invoice_number}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#18181b"><p style="color:#c8102e;font-weight:800;letter-spacing:.12em">SWISSCOMPACT</p><h1>Vielen Dank für Ihren Auftrag.</h1><p>Guten Tag ${escapeHtml(name)},</p><p>Die Offerte <strong>${escapeHtml(quote.quote_number)}</strong> wurde verbindlich angenommen. Im Anhang finden Sie die 50-%-Anzahlungsrechnung <strong>${escapeHtml(invoice.data.invoice_number)}</strong> mit Zahlungsziel 14 Tage.</p><p>Wir melden uns für die gemeinsame Projektplanung.</p><p>Freundliche Grüsse<br>Marcel Spahr und Thomas Peter<br>SwissCompact</p></div>`,
      attachments: [{ filename: `${invoice.data.invoice_number}.pdf`, content: Buffer.from(invoicePdf).toString("base64") }],
    });
    invoiceSent = !mail.error;
    if (invoiceSent) await client.from("invoices").update({ status: "sent", updated_at: new Date().toISOString() }).eq("id", invoice.data.id);
  }
  await Promise.all([
    client.from("clients").update({ lifecycle: "customer", updated_at: acceptedAt }).eq("id", quote.client_id),
    quote.opportunity_id ? client.from("opportunities").update({ stage: "deposit_50", probability: 100, value_chf: quote.total, updated_at: acceptedAt }).eq("id", quote.opportunity_id) : Promise.resolve(),
    client.from("audit_log").insert({ actor_email: email, action: "customer_quote_accepted", entity_type: "quote", entity_id: quote.id, metadata: { acceptedBy: name, invoiceId: invoice.data.id, projectId: project.data.id, invoiceSent, userAgent: cleanText(request.headers.get("user-agent"), 400) } }),
  ]);
  return json({ ok: true, quoteNumber: quote.quote_number, orderNumber: project.data.order_number, invoiceNumber: invoice.data.invoice_number, invoiceSent });
}
