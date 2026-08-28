import { Resend } from "resend";
import { json, validatePublicPost } from "../_lib/assistant/security.js";
import { escapeHtml, isSpamSubmission, tooLong } from "../_lib/assistant/spamGuard.js";
import { getAssistantSupabaseClient } from "../_lib/assistant/supabaseAdmin.js";

export const config = { runtime: "nodejs", maxDuration: 30 };

type ConversationMessage = { role: "user" | "assistant"; content: string };

function text(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function list(value: unknown, maxItems = 12) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => text(entry, 300)).filter(Boolean))).slice(0, maxItems);
}

function htmlList(items: string[], empty = "Keine Angabe.") {
  if (items.length === 0) return `<p style="margin:0;color:#9a9aa0;font-size:13px">${empty}</p>`;
  return `<ul style="margin:6px 0 0;padding-left:18px;color:#e2e2e6;font-size:13px;line-height:1.65">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

export async function POST(request: Request): Promise<Response> {
  const guardError = validatePublicPost(request, {
    key: "assistant-lead",
    limit: 5,
    windowMs: 10 * 60_000,
    contentTypes: ["application/json"],
    maxBytes: 64_000,
  });
  if (guardError) return guardError;

  // Lets the automated smoke test exercise the full validation/consent path
  // without writing test rows into the real Supabase project or sending
  // real emails on every CI run.
  const isSmokeTest = request.headers.get("x-smoke-test") === "1";

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const contact = (body?.contact as Record<string, unknown>) || {};
    const name = text(contact.name, 200);
    const email = text(contact.email, 200).toLowerCase();
    const phone = text(contact.phone, 80);
    const company = text(contact.company, 200);
    const directRequest = text(body?.directRequest, 1600);
    const conversationRaw = body?.conversation;
    const rawConversationHasUser =
      Array.isArray(conversationRaw) &&
      conversationRaw.some((message: unknown) => {
        if (!message || typeof message !== "object") return false;
        const entry = message as Record<string, unknown>;
        return entry.role === "user" && Boolean(text(entry.content, 1600));
      });
    const lead = (body?.lead as Record<string, unknown>) || {};
    const rawConversationSummary = text(lead.conversationSummary || body?.conversationSummary, 1200);
    const hasConversationContext = rawConversationHasUser || Boolean(rawConversationSummary);

    if (
      !name ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^[+()\d\s.\-/]{6,40}$/.test(phone) ||
      body?.consent !== true
    ) {
      return json({ error: "Fehlende oder ungültige Pflichtfelder" }, { status: 400 });
    }
    if (tooLong(body?.conversationSummary, 1200) || tooLong(body?.directRequest, 1600)) {
      return json({ error: "Eingabe zu lang" }, { status: 400 });
    }
    if (!hasConversationContext && directRequest.length < 10) {
      return json({ error: "Ein konkretes Anliegen ist erforderlich" }, { status: 400 });
    }
    if (isSpamSubmission(body?.hpWebsite, body?.startedAt)) {
      return json({ ok: true });
    }

    if (isSmokeTest) {
      return json({ ok: true, requestId: "smoke-test", customerId: "smoke-test", dealId: "smoke-test" });
    }

    const resendKey = process.env.RESEND_API_KEY;
    const supabase = getAssistantSupabaseClient();
    if (!supabase) {
      console.error("assistant/lead: missing Supabase configuration");
      return json({ error: "Kontaktübergabe ist nicht vollständig konfiguriert" }, { status: 503 });
    }

    const recommendation = (body?.recommendation as Record<string, unknown>) || {};
    const goals = list(lead.goals);
    const problems = list(lead.problems);
    const notWanted = list(lead.notWanted);
    const existingSystems = list(lead.existingSystems);
    const recommendedServices = list(lead.recommendedServices);
    const deliberatelyLater = list(recommendation.notRecommended, 6);
    const industry = text(lead.industry, 200);
    const location = text(lead.location, 200);
    const leadTemperature = ["unknown", "cold", "warm", "hot"].includes(String(lead.leadTemperature))
      ? String(lead.leadTemperature)
      : "unknown";
    const conversationSummary = text(lead.conversationSummary || body?.conversationSummary, 1200);
    const conversation: ConversationMessage[] = Array.isArray(conversationRaw)
      ? conversationRaw
          .filter((message: unknown): message is Record<string, unknown> => Boolean(message) && typeof message === "object")
          .map((message: Record<string, unknown>) => ({
            role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: text(message.content, 1600),
          }))
          .filter((message) => message.content)
          .slice(-12)
      : [];

    const section = (label: string, values: string[]) =>
      values.length ? `${label}:\n- ${values.join("\n- ")}` : `${label}: Keine Angabe.`;
    const transcript = conversation.length
      ? conversation.map((message) => `${message.role === "assistant" ? "Assistent" : "Kunde"}: ${message.content}`).join("\n\n")
      : "Kein Gesprächsprotokoll verfügbar.";
    const crmNotes = (
      hasConversationContext
        ? [
            "ASSISTENT-GESPRÄCH",
            conversationSummary ? `Zusammenfassung: ${conversationSummary}` : null,
            industry ? `Branche: ${industry}` : null,
            location ? `Standort: ${location}` : null,
            section("Ziele / gewünscht", goals),
            section("Probleme", problems),
            section("Nicht gewünscht / ausgeschlossen", notWanted),
            section("Bestehende Systeme", existingSystems),
            section("Empfohlene Leistungen", recommendedServices),
            section("Bewusst später / nicht priorisiert", deliberatelyLater),
            `Lead-Einstufung: ${leadTemperature}`,
            `Kontakt: ${name} · ${email} · ${phone}`,
            "",
            "GESPRÄCHSPROTOKOLL",
            transcript,
          ]
        : [
            "DIREKTE ANFRAGE",
            `Anliegen: ${directRequest}`,
            industry ? `Branche: ${industry}` : null,
            location ? `Standort: ${location}` : null,
            `Kontakt: ${name} · ${email} · ${phone}`,
          ]
    )
      .filter((entry): entry is string => entry !== null)
      .join("\n\n")
      .slice(0, 30_000);

    const { data: requestRow, error: requestError } = await supabase
      .from("kontaktanfragen")
      .insert({ name, email, nachricht: crmNotes, sprache: "de", quelle: "sales-assistant", status: "neu" })
      .select("id")
      .single();
    if (requestError) throw new Error(`Kontaktanfrage: ${requestError.message}`);

    const { data: existingCustomer, error: existingError } = await supabase
      .from("kunden")
      .select("id,notizen")
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(`Kundensuche: ${existingError.message}`);

    let customerId = existingCustomer?.id as string | undefined;
    if (customerId) {
      const notes = [existingCustomer?.notizen, crmNotes].filter(Boolean).join("\n\n––––––––––\n\n").slice(0, 50_000);
      const { error } = await supabase
        .from("kunden")
        .update({
          kontaktperson: name,
          firmenname: company || null,
          telefon: phone,
          branche: industry || null,
          status: "lead",
          notizen: notes,
        })
        .eq("id", customerId);
      if (error) throw new Error(`Kundenaktualisierung: ${error.message}`);
    } else {
      const { data, error } = await supabase
        .from("kunden")
        .insert({
          kontaktperson: name,
          firmenname: company || null,
          email,
          telefon: phone,
          branche: industry || null,
          status: "lead",
          notizen: crmNotes,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Kundenerstellung: ${error.message}`);
      customerId = data?.id;
    }

    const probability = leadTemperature === "hot" ? 70 : leadTemperature === "warm" ? 50 : 30;
    const { data: dealRow, error: dealError } = await supabase
      .from("deals")
      .insert({
        titel: `Assistant-Anfrage · ${company || name}`,
        kunden_id: customerId || null,
        status: "lead",
        wahrscheinlichkeit: probability,
        notizen: crmNotes,
      })
      .select("id")
      .single();
    if (dealError) throw new Error(`Pipeline-Lead: ${dealError.message}`);

    const safe = {
      name: escapeHtml(name),
      email: escapeHtml(email),
      phone: escapeHtml(phone),
      company: escapeHtml(company),
      industry: escapeHtml(industry),
      location: escapeHtml(location),
      summary: escapeHtml(conversationSummary),
      request: escapeHtml(directRequest),
    };
    let adminEmailDelivered = false;
    let customerEmailDelivered = false;
    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        const adminMail = await resend.emails.send({
        from: "SwissCompact Assistent <noreply@swisscompact.com>",
        to: "kontakt@swisscompact.com",
        replyTo: email,
        subject: `Neue Anfrage über den Assistenten · ${company || name}`,
        html: `
        <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;background:#060607;color:#e9e9ec;border:1px solid #2a2a30">
          <div style="padding:26px 30px;border-bottom:1px solid #2a2a30;background:#0d0d10">
            <p style="margin:0 0 8px;color:#c8102e;font-size:12px;letter-spacing:.14em;font-weight:700">${
              hasConversationContext ? "ASSISTENT · QUALIFIZIERTER KONTAKT" : "DIREKTE ANFRAGE"
            }</p>
            <h1 style="margin:0;font-size:24px">${safe.company || safe.name}</h1>
          </div>
          <div style="padding:28px 30px">
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px">
              <tr><td style="padding:6px 0;color:#9a9aa0;width:120px">Name</td><td>${safe.name}</td></tr>
              <tr><td style="padding:6px 0;color:#9a9aa0">E-Mail</td><td><a href="mailto:${safe.email}" style="color:#c8102e">${safe.email}</a></td></tr>
              <tr><td style="padding:6px 0;color:#9a9aa0">Telefon</td><td><a href="tel:${safe.phone}" style="color:#c8102e">${safe.phone}</a></td></tr>
              ${safe.company ? `<tr><td style="padding:6px 0;color:#9a9aa0">Unternehmen</td><td>${safe.company}</td></tr>` : ""}
              ${safe.industry ? `<tr><td style="padding:6px 0;color:#9a9aa0">Branche</td><td>${safe.industry}</td></tr>` : ""}
              ${safe.location ? `<tr><td style="padding:6px 0;color:#9a9aa0">Standort</td><td>${safe.location}</td></tr>` : ""}
            </table>
            ${safe.request ? `<div style="padding:16px 18px;margin-bottom:22px;background:#0d0d10;border-left:3px solid #c8102e"><strong style="color:#c8102e;font-size:12px">ANLIEGEN</strong><p style="margin:8px 0 0;line-height:1.6">${safe.request}</p></div>` : ""}
            ${safe.summary ? `<div style="padding:16px 18px;margin-bottom:22px;background:#0d0d10;border-left:3px solid #c8102e"><strong style="color:#c8102e;font-size:12px">GESPRÄCHS-ZUSAMMENFASSUNG</strong><p style="margin:8px 0 0;line-height:1.6">${safe.summary}</p></div>` : ""}
            ${
              hasConversationContext
                ? `
              <h2 style="font-size:14px;color:#c8102e;margin:20px 0 4px">Gewünscht / Ziele</h2>${htmlList(goals)}
              <h2 style="font-size:14px;color:#c8102e;margin:20px 0 4px">Probleme</h2>${htmlList(problems)}
              <h2 style="font-size:14px;color:#c8102e;margin:20px 0 4px">Nicht gewünscht / ausgeschlossen</h2>${htmlList(notWanted)}
              <h2 style="font-size:14px;color:#c8102e;margin:20px 0 4px">Empfohlene Leistungen</h2>${htmlList(recommendedServices)}
            `
                : ""
            }
            <div style="margin-top:28px">
              <a href="mailto:${safe.email}?subject=Ihre Anfrage bei SwissCompact" style="display:inline-block;padding:12px 20px;background:#c8102e;color:#ffffff;text-decoration:none;font-weight:700">Direkt antworten</a>
            </div>
          </div>
          <div style="padding:14px 30px;border-top:1px solid #2a2a30;color:#77777e;font-size:11px">Kontakt ${requestRow?.id || ""} · Kunde ${customerId || ""} · Deal ${dealRow?.id || ""}</div>
        </div>`,
        });
        if (adminMail.error) {
          console.error("assistant/lead: admin notification failed", adminMail.error.message);
        } else {
          adminEmailDelivered = true;
        }

        const customerMail = await resend.emails.send({
          from: "SwissCompact <kontakt@swisscompact.com>",
          to: email,
          subject: "Deine Anfrage ist bei uns angekommen.",
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#20231f"><h1>Danke, ${safe.name}.</h1><p>${
            hasConversationContext
              ? "Deine Kontaktdaten und der Kontext aus deinem Gespräch mit unserem Assistenten"
              : "Deine Kontaktdaten und dein Anliegen"
          } sind bei uns angekommen. Wir prüfen alles persönlich und melden uns innerhalb von zwei Arbeitstagen.</p><p>Freundliche Grüsse<br><strong>SwissCompact</strong></p></div>`,
        });
        if (customerMail.error) {
          console.error("assistant/lead: customer confirmation failed", customerMail.error.message);
        } else {
          customerEmailDelivered = true;
        }
      } catch (emailError) {
        console.error(
          "assistant/lead: email delivery failed after CRM save",
          emailError instanceof Error ? emailError.message : "Unknown error",
        );
      }
    } else {
      console.warn("assistant/lead: Resend is not configured; lead saved without email notifications");
    }

    return json({
      ok: true,
      requestId: requestRow?.id,
      customerId,
      dealId: dealRow?.id,
      delivery: {
        crm: true,
        adminEmail: adminEmailDelivered,
        customerEmail: customerEmailDelivered,
      },
    });
  } catch (error) {
    console.error("assistant/lead:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Die Kontaktübergabe konnte nicht abgeschlossen werden." }, { status: 500 });
  }
}
