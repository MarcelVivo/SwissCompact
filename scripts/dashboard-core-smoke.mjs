import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260828_dashboard_core.sql");
const auth = read("api/_lib/dashboard/auth.ts");
const ui = read("src/dashboard/main.tsx");
const records = read("api/dashboard/records.ts");
const lead = read("api/assistant/lead.ts");
const vercel = JSON.parse(read("vercel.json"));

assert.ok(existsSync(new URL("../dashboard.html", import.meta.url)), "dashboard.html fehlt");
assert.ok(vercel.rewrites.some((rule) => rule.source === "/dashboard" && rule.destination === "/dashboard.html"), "Dashboard-Rewrite fehlt");
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

for (const area of ["Auftragstrichter", "Kundenkartei", "Finanzen", "KI-Bots", "Sicherheit & Protokoll"]) {
  assert.ok(ui.includes(area), `UI-Bereich ${area} fehlt`);
}
for (const action of ["update_client", "update_opportunity"]) {
  assert.ok(records.includes(`action === "${action}"`), `CRM-Aktion ${action} fehlt`);
}
assert.ok(ui.includes("ClientDrawer"), "Kunden-Detailansicht fehlt");
assert.ok(ui.includes("OpportunityDrawer"), "Chancen-Detailansicht fehlt");
assert.match(lead, /\.from\("clients"\)/, "Website-Anfrage wird nicht in Dashboard-Kunden synchronisiert");
assert.match(lead, /\.from\("opportunities"\)/, "Website-Anfrage wird nicht in Dashboard-Trichter synchronisiert");
assert.match(lead, /website_lead_created/, "Website-Anfrage wird nicht protokolliert");
assert.ok(existsSync(new URL("../dist/dashboard.html", import.meta.url)), "Produktions-Build für Dashboard fehlt");

console.log("Dashboard core smoke checks passed.");
