import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260904_project_collaboration.sql");
const records = read("api/dashboard/records.ts");
const overview = read("api/dashboard/overview.ts");
const dashboard = read("src/dashboard/main.tsx");
const portal = read("src/portal/main.tsx");

for (const table of ["project_messages", "project_deliverables", "project_deliverable_versions", "project_review_decisions", "project_revision_rounds"]) {
  assert.ok(migration.includes(`create table if not exists swisscompact.${table}`), `${table} fehlt`);
}
assert.match(migration, /validate_project_collaboration_scope/);
assert.match(migration, /enable row level security/);
for (const action of ["post_project_message", "prepare_project_reference_upload", "finalize_project_reference_upload", "review_project_deliverable", "decide_project_revision_cost", "update_project_briefing", "post_dashboard_project_message", "prepare_project_deliverable_upload", "finalize_project_deliverable_upload", "scope_project_revision", "publish_project_deliverable", "project_file_url"]) {
  assert.ok(records.includes(`action === "${action}"`), `${action} fehlt`);
}
assert.match(records, /eq\("client_id", profile\.clientId\).*eq\("tenant_id", profile\.tenantId\)/s, "Portaldateien sind nicht doppelt mandantengeprüft");
assert.match(records, /createSignedUploadUrl/);
assert.match(records, /createSignedUrl/);
assert.match(overview, /projectCollaboration/);
for (const label of ["Verbindliches Briefing", "Kommunikation", "Entwürfe und Versionen", "Korrekturrunden", "Auftragsakte öffnen"]) assert.ok(dashboard.includes(label), `Dashboard: ${label} fehlt`);
for (const label of ["Gemeinsame Auftragsakte", "Entwürfe & Freigabe", "Verbindlich freigeben", "Änderung wünschen", "Kosten bestätigen"]) assert.ok(portal.includes(label), `Portal: ${label} fehlt`);

console.log("Project collaboration smoke checks passed.");
