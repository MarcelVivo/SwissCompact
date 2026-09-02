import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260919_support_attachments.sql");
const records = read("api/dashboard/records.ts");
const overview = read("api/dashboard/overview.ts");
const supportAi = read("api/_lib/support/ai.ts");
const portal = read("src/portal/main.tsx");
const portalSupport = read("src/portal/SupportCenter.tsx");
const dashboardSupport = read("src/dashboard/SupportOperations.tsx");

for (const value of [
  "support_ticket_attachments",
  "validate_support_attachment_scope",
  "swisscompact-support",
  "ai_analysis_allowed",
  "enable row level security",
  "visible_to_customer and swisscompact.is_tenant_member(tenant_id)",
]) assert.ok(migration.includes(value), `Migration enthält ${value} nicht`);

for (const action of ["prepare_support_attachment", "finalize_support_attachment", "process_support_ticket"]) {
  assert.ok(records.includes(`action === "${action}"`), `API-Aktion ${action} fehlt`);
}
assert.match(records, /SUPPORT_ATTACHMENT_TYPES/);
assert.match(records, /10 \* 1024 \* 1024/);
assert.match(records, /supportAttachment/);
assert.match(records, /attachmentIds/);
assert.match(overview, /supportAttachmentsAvailable/);
assert.match(overview, /support_ticket_attachments/);
assert.match(supportAi, /type: "input_image"/);
assert.match(supportAi, /ai_analysis_allowed/);
assert.match(supportAi, /store: false/);
assert.match(portal, /uploadSupportAttachment/);
assert.match(portal, /openSupportAttachment/);
assert.match(portalSupport, /Screenshot oder Dokument/);
assert.match(portalSupport, /KI darf diese Bilder zur Fehleranalyse ansehen/);
assert.match(portalSupport, /setActiveId\(ticketId\)/);
assert.match(dashboardSupport, /Datei für den Kunden/);
assert.match(dashboardSupport, /AdminAttachments/);

console.log("Support attachment smoke checks passed.");
