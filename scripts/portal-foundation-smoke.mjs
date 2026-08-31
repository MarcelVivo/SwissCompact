import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260830_customer_platform.sql");
const mediaMigration = read("supabase/migrations/20260831_portal_media.sql");
const deviceMigration = read("supabase/migrations/20260831_display_devices.sql");
const auth = read("api/_lib/dashboard/auth.ts");
const records = read("api/dashboard/records.ts");
const overview = read("api/dashboard/overview.ts");
const portal = read("src/portal/main.tsx");
const campaignCss = read("src/portal/portal-campaign.css");
const vercel = JSON.parse(read("vercel.json"));
const vite = read("vite.config.ts");

const checks = {
  tables: ["tenants", "tenant_memberships", "tenant_displays", "tenant_content", "tenant_campaigns"].every((name) => migration.includes(`swisscompact.${name}`)),
  rls: migration.includes("enable row level security") && migration.includes("is_tenant_member") && migration.includes("can_edit_tenant"),
  tenantAuthorization: auth.includes("authorizePortal") && auth.includes("tenant_memberships") && auth.includes("tenant_domains"),
  scopedWrites: records.includes('eq("tenant_id", profile.tenantId)') && records.includes('tenant_id: profile.tenantId'),
  customerUi: portal.includes("Medien & Vorlagen") && portal.includes("Bildschirme") && portal.includes("Anzeigen") && portal.includes("Konto & Service"),
  portalBuild: vite.includes("portal.html") && vercel.rewrites.some((item) => item.source === "/portal" && item.destination === "/portal.html"),
  noHardcodedTenant: !portal.includes("swisscompact-demo"),
  privateMedia: mediaMigration.includes("'swisscompact-media'") && mediaMigration.includes("public = false") && mediaMigration.includes("can_edit_tenant"),
  signedUploads: records.includes("createSignedUploadUrl") && records.includes("finalize_media_upload") && records.includes("cancel_media_upload") && portal.includes("prepared.upload.signedUrl"),
  resumableVideoUploads: records.includes("resumableStorageUrl") && records.includes("signed.data.token") && portal.includes("new Upload(file") && portal.includes('"x-signature"') && portal.includes("uploadProgress"),
  campaignEditor: records.includes("configure_campaign") && records.includes("activate_campaign") && records.includes("pause_campaign") && portal.includes("CampaignEditor"),
  deviceSecurity: deviceMigration.includes("device_token_hash") && deviceMigration.includes("pairing_code_hash") && records.includes('mode === "pair"') && records.includes('mode === "heartbeat"'),
  displayPreview: portal.includes("DisplayPreview") && portal.includes("Noch nicht aktiviert") && portal.includes("Kein Motiv zugeordnet"),
  creatorAttribution: overview.includes("creator_name") && overview.includes("created_by") && overview.includes("tenant_audit_log") && portal.includes("Erstellt von"),
  safeDeletion: ["delete_content", "delete_campaign", "delete_display"].every((action) => records.includes(action)) && records.includes("Löschen Sie zuerst diese Anzeige") && records.includes("bumpDisplayConfigurations") && portal.includes("DeleteDialog") && portal.includes("Diese Aktion kann nicht rückgängig gemacht werden"),
  logicalWorkflow: portal.includes('[["overview","Übersicht"],["campaigns","Anzeigen"],["content","Medien & Vorlagen"],["displays","Bildschirme"]') && portal.includes("Anzeige in vier Schritten erstellen") && ["Motiv auswählen", "Bildschirm wählen", "Zeitraum festlegen", "Prüfen & starten"].every((label) => portal.includes(label)),
  simpleCampaignWizard: ["Was möchten Sie zeigen?", "Wo soll die Anzeige erscheinen?", "Wann soll die Anzeige laufen?", "Alles bereit?"].every((label) => portal.includes(label)) && portal.includes('action: "create_campaign"') && portal.includes('action: "configure_campaign"'),
  responsiveCampaignEditor: campaignCss.includes("wizard-date-pair") && campaignCss.includes("minmax(0, 1fr)") && campaignCss.includes("overflow: hidden") && campaignCss.includes("overflow: auto"),
  inWizardMediaCreation: ["Vorhandenes Motiv", "Bild oder Video", "KI-Bild erstellen", "Hochladen und auswählen"].every((label) => portal.includes(label)) && portal.includes("acceptCreatedContent") && portal.includes('status: "approved"') && campaignCss.includes("campaign-child-backdrop"),
};

console.log(JSON.stringify(checks, null, 2));
if (Object.values(checks).some((value) => !value)) process.exit(1);
