import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260828_dashboard_core.sql");
const acceptanceMigration = read("supabase/migrations/20260829_quote_acceptance.sql");
const auth = read("api/_lib/dashboard/auth.ts");
const ui = read("src/dashboard/main.tsx");
const records = read("api/dashboard/records.ts");
const publicQuote = read("api/_lib/dashboard/quote-public.ts");
const lead = read("api/assistant/lead.ts");
const vercel = JSON.parse(read("vercel.json"));

assert.ok(existsSync(new URL("../dashboard.html", import.meta.url)), "dashboard.html fehlt");
assert.ok(existsSync(new URL("../quote.html", import.meta.url)), "Öffentliche Offertenseite fehlt");
assert.ok(vercel.rewrites.some((rule) => rule.source === "/dashboard" && rule.destination === "/dashboard.html"), "Dashboard-Rewrite fehlt");
assert.ok(vercel.rewrites.some((rule) => rule.source === "/offerte/:token" && rule.destination === "/quote"), "Sicherer Offertenlink fehlt");
assert.match(auth, /kontakt@swisscompact\.com/);
assert.match(auth, /thomas\.peter@swisscompact\.com/);
assert.match(auth, /owner_admin/);
assert.match(auth, /Zwei-Faktor-Authentifizierung erforderlich/);

for (const table of ["dashboard_profiles", "audit_log", "clients", "opportunities", "projects", "approvals", "quotes", "invoices", "journal_entries", "journal_lines", "founder_transactions", "owner_settlements", "subscription_packages", "ai_jobs", "marketing_campaigns"]) {
  assert.match(migration, new RegExp(`create table if not exists swisscompact\\.${table}`), `${table} fehlt`);
}
for (const stage of ["request", "consulting", "customer_decision", "deposit_50", "hardware_concept", "software_development", "installation_30", "acceptance", "final_invoice_20", "maintenance"]) {
  assert.ok(migration.includes(`'${stage}'`), `Trichterphase ${stage} fehlt`);
}
assert.match(migration, /"deposit":50,"installation":30,"acceptance":20/);
assert.match(migration, /"monthlyLimitChf":100,"warningAtChf":70,"hardStop":true/);
assert.match(migration, /"legalStatus":"pre_founding"/);
assert.match(migration, /'2026-08-05'.*'company_expense'.*'marcel'.*600/s);
assert.match(migration, /'2026-08-28'.*'settlement_transfer'.*'thomas'.*'marcel'.*300/s);

for (const area of ["Auftragstrichter", "Kundenkartei", "Rechnungen", "Finanzen", "KI-Bots", "Sicherheit & Protokoll"]) {
  assert.ok(ui.includes(area), `UI-Bereich ${area} fehlt`);
}
for (const action of ["update_client", "update_opportunity", "create_quote", "update_quote", "request_quote_approval", "publish_quote", "create_project_from_opportunity", "update_project", "request_project_payment_approval", "invoice_document_url", "update_task_status"]) {
  assert.ok(records.includes(`action === "${action}"`), `CRM-Aktion ${action} fehlt`);
}
assert.ok(ui.includes("ClientDrawer"), "Kunden-Detailansicht fehlt");
assert.ok(ui.includes("OpportunityDrawer"), "Chancen-Detailansicht fehlt");
assert.ok(ui.includes("ProjectDrawer"), "Projekt-Detailansicht fehlt");
assert.ok(ui.includes("PaymentApproval"), "Vier-Augen-Zahlungsfreigabe fehlt");
assert.ok(ui.includes("QuoteDrawer"), "Offerten-Kalkulationseditor fehlt");
assert.ok(ui.includes("InvoiceDrawer"), "Rechnungs-Detailansicht fehlt");
assert.match(records, /Eine versendete oder abgeschlossene Offerte kann nicht mehr verändert werden/);
assert.match(records, /quote_approval/);
assert.match(records, /50 % vor Projektstart, 30 % bei Montagebeginn und 20 % nach unterzeichneter Kundenabnahme/);
assert.match(records, /Projektstart ist erst nach bestätigter 50-%-Anzahlung möglich/);
assert.match(records, /Schlusszahlung erst nach Montagezahlung und Kundenabnahme bestätigen/);
assert.match(records, /marcel_approved_at.*thomas_approved_at/s);
assert.match(records, /randomBytes\(32\).*token_hash/s, "Persönlicher Link verwendet kein starkes gehashtes Token");
assert.match(records, /createQuotePdf.*immutable_pdf_path.*document_hash/s, "Unveränderbare Offertenversion fehlt");
assert.match(records, /searchParams\.get\("public"\) === "quote".*postPublicQuote/s, "Öffentliche Offerten-POST-Route wurde nicht konsolidiert");
assert.match(records, /searchParams\.get\("public"\) === "quote".*getPublicQuote/s, "Öffentliche Offerten-GET-Route wurde nicht konsolidiert");
assert.match(records, /from\("invoices"\)\.update\(\{ status: "paid".*\.eq\("installment", payment\)/s, "Zahlungsfreigabe verbucht Rechnung nicht");
assert.match(records, /createSignedUrl\(invoice\.data\.immutable_pdf_path, 10 \* 60\)/, "Geschützter Rechnungsdownload fehlt");
assert.match(acceptanceMigration, /quote_access_tokens/);
assert.match(acceptanceMigration, /invoices_quote_installment_unique/);
assert.match(publicQuote, /\.in\("status", \["sent", "viewed"\]\)/, "Atomare Einmalannahme fehlt");
assert.match(publicQuote, /installment: "deposit_50"/);
assert.match(publicQuote, /Math\.round\(Number\(quote\.total\) \* 50\) \/ 100/);
assert.match(publicQuote, /stage: "deposit_50"/);
assert.match(publicQuote, /createDepositInvoicePdf/);
assert.match(lead, /\.from\("clients"\)/, "Website-Anfrage wird nicht in Dashboard-Kunden synchronisiert");
assert.match(lead, /\.from\("opportunities"\)/, "Website-Anfrage wird nicht in Dashboard-Trichter synchronisiert");
assert.match(lead, /website_lead_created/, "Website-Anfrage wird nicht protokolliert");
assert.ok(existsSync(new URL("../dist/dashboard.html", import.meta.url)), "Produktions-Build für Dashboard fehlt");
assert.ok(existsSync(new URL("../dist/quote.html", import.meta.url)), "Produktions-Build für Offertenseite fehlt");

console.log("Dashboard core smoke checks passed.");
