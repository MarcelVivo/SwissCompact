import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260830_customer_platform.sql");
const mediaMigration = read("supabase/migrations/20260831_portal_media.sql");
const deviceMigration = read("supabase/migrations/20260831_display_devices.sql");
const targetingMigration = read("supabase/migrations/20260902_campaign_targeting.sql");
const customerVerificationMigration = read("supabase/migrations/20260903_verified_portal_customers.sql");
const partnerMigration = read("supabase/migrations/20260907_partner_network.sql");
const campaignTemplateMigration = read("supabase/migrations/20260908_campaign_templates.sql");
const partnerApi = read("api/_lib/portal/partner-network.ts");
const partnerView = read("src/portal/PartnerNetworkView.tsx");
const campaignTemplates = read("src/portal/CampaignTemplates.tsx");
const auth = read("api/_lib/dashboard/auth.ts");
const records = read("api/dashboard/records.ts");
const overview = read("api/dashboard/overview.ts");
const portal = read("src/portal/main.tsx");
const campaignCss = read("src/portal/portal-campaign.css");
const semanticsCss = read("src/portal/portal-semantics.css");
const onboardingCss = read("src/portal/portal-onboarding.css");
const scrollCss = read("src/portal/portal-scroll.css");
const templateCss = read("src/portal/portal-templates.css");
const vercel = JSON.parse(read("vercel.json"));
const vite = read("vite.config.ts");

const checks = {
  tables: ["tenants", "tenant_memberships", "tenant_displays", "tenant_content", "tenant_campaigns"].every((name) => migration.includes(`swisscompact.${name}`)),
  rls: migration.includes("enable row level security") && migration.includes("is_tenant_member") && migration.includes("can_edit_tenant"),
  tenantAuthorization: auth.includes("authorizePortal") && auth.includes("tenant_memberships") && auth.includes("tenant_domains"),
  verifiedCustomerAccess: customerVerificationMigration.includes("is_verified_portal_customer") && customerVerificationMigration.includes("tenants_active_client_required") && auth.includes("is_verified_portal_customer") && auth.includes("clientId"),
  verifiedPortalUsers: ["access_status", "verified_at", "email_confirmed_at", "is_verified_portal_user", "tenant_memberships_active_status_consistent"].every((label) => customerVerificationMigration.includes(label)) && auth.includes("user.email_confirmed_at") && auth.includes('.eq("access_status", "active")') && overview.includes('member.access_status === "active"'),
  guidedInvitationActivation: auth.includes("activatePendingPortalMembership") && auth.includes("portal_invitation_accepted") && records.includes('action === "provision_client_portal"') && records.includes('action === "resend_portal_invitation"') && records.includes('action === "update_portal_member_access"') && portal.includes("PortalAccessSetup") && portal.includes("Passwort speichern und Portal öffnen") && portal.includes("exchangeCodeForSession") && portal.includes('audience: "portal"'),
  safeCustomerMigration: customerVerificationMigration.includes("candidate_client_ids") && customerVerificationMigration.includes("passt zu mehreren Kundenkarteien") && customerVerificationMigration.includes("Bestandsprüfung") && customerVerificationMigration.includes("bricht vollständig ab"),
  scopedWrites: records.includes('eq("tenant_id", profile.tenantId)') && records.includes('tenant_id: profile.tenantId'),
  customerUi: portal.includes("Medien & Vorlagen") && portal.includes("Bildschirme") && portal.includes("Kampagnen") && portal.includes("Konto & Service"),
  portalBuild: vite.includes("portal.html") && vercel.rewrites.some((item) => item.source === "/portal" && item.destination === "/portal.html"),
  noHardcodedTenant: !portal.includes("swisscompact-demo"),
  privateMedia: mediaMigration.includes("'swisscompact-media'") && mediaMigration.includes("public = false") && mediaMigration.includes("can_edit_tenant"),
  signedUploads: records.includes("createSignedUploadUrl") && records.includes("finalize_media_upload") && records.includes("cancel_media_upload") && portal.includes("prepared.upload.signedUrl"),
  resumableVideoUploads: records.includes('url.pathname = "/storage/v1/upload/resumable/sign"') && records.includes("data!.token") && portal.includes("new Upload(file") && portal.includes('"x-signature"') && portal.includes("uploadProgress"),
  campaignEditor: records.includes("configure_campaign") && records.includes("activate_campaign") && records.includes("pause_campaign") && portal.includes("CampaignEditor"),
  deviceSecurity: deviceMigration.includes("device_token_hash") && deviceMigration.includes("pairing_code_hash") && records.includes('mode === "pair"') && records.includes('mode === "heartbeat"'),
  displayPreview: portal.includes("DisplayPreview") && portal.includes("Noch nicht aktiviert") && portal.includes("Kein Motiv zugeordnet"),
  creatorAttribution: overview.includes("creator_name") && overview.includes("created_by") && overview.includes("tenant_audit_log") && portal.includes("Erstellt von"),
  safeDeletion: ["delete_content", "delete_campaign", "delete_display"].every((action) => records.includes(action)) && records.includes("confirmationName") && records.includes("bumpDisplayConfigurations") && portal.includes("DeleteDialog") && ["Bestätigung {stage} von 2", "zweites Mal", "zweiten Bestätigung", "endgültig löschen"].every((label) => portal.includes(label)) && !["Weiter zur Sicherheitsabfrage", "Name zur Bestätigung"].some((label) => portal.includes(label)),
  mediaArchive: ["archive_content", "restore_content", "delete_content"].every((action) => records.includes(`action === "${action}"`)) && records.includes('status !== "archived"') && overview.includes("archivedContent") && overview.includes('item.status !== "archived"') && ["Medienarchiv", "Archivieren", "Wiederherstellen", "Endgültig löschen", "archived_content"].every((label) => portal.includes(label)),
  professionalContentRequest: records.includes('action === "create_service_request"') && records.includes("create_portal_service_request") && records.includes("new Resend") && customerVerificationMigration.includes("portal_request_id") && customerVerificationMigration.includes("opportunities") && overview.includes("serviceRequests") && ["Von SwissCompact erstellen lassen", "Produktion anfragen", "ServiceRequestDialog", "Anfrage an SwissCompact senden", "Unverbindliche Anfrage"].every((label) => portal.includes(label)),
  logicalWorkflow: portal.includes('[["overview","Übersicht"],["records","Meine Vorgänge"],["campaigns","Kampagnen"],["displays","Bildschirme"],["content","Medien & Vorlagen"]') && portal.includes("PortalOnboarding") && ["Wo anzeigen?", "Was anzeigen?", "Wann anzeigen?", "Prüfen und veröffentlichen"].every((label) => portal.includes(label)),
  resumableOnboarding: ["campaignHasContentForEveryDisplay", "onboardingCampaign", "onboardingStep", "portalSetupStep", "Einrichtung fortsetzen", "Bereit für weitere Ausspielungen"].every((label) => portal.concat(records).includes(label)) && [".portal-onboarding-steps article.current", ".portal-onboarding-steps article.done", ".portal-onboarding-steps article.locked"].every((label) => onboardingCss.includes(label)),
  customerRecords: overview.includes("customerRecords") && overview.includes('.eq("client_id", profile.clientId)') && records.includes('action === "create_portal_quote_access"') && records.includes("handlePortalDocument") && records.includes('.eq("client_id", profile.clientId)') && ["Meine Vorgänge", "Produktionsanfragen", "Offerten", "Aufträge", "Rechnungen", "Ansehen & entscheiden", "PDF herunterladen"].every((label) => portal.includes(label)),
  customerNotifications: records.includes("sendCustomerStatusNotification") && records.includes("Meine Vorgänge öffnen") && records.includes("Customer status notification failed"),
  simpleCampaignWizard: ["Wo soll etwas erscheinen?", "Was soll dort laufen?", "Wann soll die Anzeige laufen?", "Alles richtig?"].every((label) => portal.includes(label)) && portal.includes('action: "create_campaign"') && portal.includes('action: "configure_campaign"'),
  responsiveCampaignEditor: campaignCss.includes("wizard-date-pair") && campaignCss.includes("minmax(0, 1fr)") && campaignCss.includes("overflow: hidden") && campaignCss.includes("overflow: auto"),
  singleDialogScrollArea: [".dialog-backdrop", "overflow-y: auto", ".wizard-stage", ".selection-list", "max-height: none", "overflow: visible"].every((value) => scrollCss.includes(value)),
  inWizardMediaCreation: ["Vorhandenen Inhalt wählen", "Bild oder Video hochladen", "KI-Bild erstellen", "Hochladen und auswählen"].every((label) => portal.includes(label)) && portal.includes("acceptCreatedContent") && portal.includes('status: "approved"') && campaignCss.includes("campaign-child-backdrop"),
  scalableCampaignTargeting: targetingMigration.includes("tenant_areas") && targetingMigration.includes("tenant_campaign_display_content") && targetingMigration.includes("on conflict (campaign_id, display_id, content_id) do nothing") && records.includes("targetAssignments") && records.includes("targetContentByCampaign") && overview.includes("target_assignments") && ["Überall gleich", "Je Bildschirm anders", "target-tree", "target-tabs"].every((label) => portal.includes(label)),
  directDisplayAssignment: ["Auf Bildschirm anzeigen", "Inhalt zuweisen", "CampaignPreset"].every((label) => portal.includes(label)) && portal.includes("campaign ? initialStep : preset?.startStep || 1") && portal.includes("ensureCampaignDraft") && portal.includes("Ihre Auswahl wird automatisch als Entwurf gespeichert"),
  guidedCampaignFunnel: ["funnel-current-step", "stepCollapsed", "Schritt öffnen", "Zuklappen", "Öffnen", "Weiter zu Inhalten", "Weiter zum Zeitpunkt", "Weiter zur Prüfung"].every((label) => portal.includes(label)) && !portal.includes('className="wizard-progress"') && campaignCss.includes(".wizard-stage.is-collapsed"),
  beginnerCampaignFlow: ["Auf Bildschirm anzeigen", "Wo?", "Was?", "Wann?", "Jetzt starten", "Für später planen", "Interner Name", "Ohne Eingabe wird der Name automatisch erstellt", "Jetzt veröffentlichen"].every((label) => portal.includes(label)) && records.includes("portalSetupStep") && campaignCss.includes(".simple-schedule"),
  semanticPortalColors: ["--state-confirmed", ".selection-row.selected", ".display-selection > label.selected", ".upload-progress > span", ".ai-options label.selected", ".portal-onboarding-steps article.current", ".primary"].every((label) => semanticsCss.includes(label)) && portal.includes('import "./portal-semantics.css"'),
  safePartnerAdvertising: ["tenant_partnerships", "tenant_partner_content_offers", "validate_partner_network_scope", "enable row level security", "service_role", "barter_credit_limit_points", "delivery_value_points", "settlement_mode", "playlist_share_percent", "delivery_status"].every((label) => partnerMigration.includes(label)) && ["invite_partner", "respond_partner_invitation", "create_partner_offer", "respond_partner_offer", "partnerDeliveryValue", "pointsBalance", "update_partner_delivery", "cash_received", "partnerSource", "sharedAsset"].every((label) => partnerApi.concat(records).includes(label)) && ["Optionale Zusatzfunktion", "1 Werbepunkt", "Fairer Werbetausch", "Bezahlte Werbung", "Partner verbinden", "Ausspielung bestätigen"].every((label) => partnerView.includes(label)) && overview.includes("loadPartnerNetwork") && portal.includes("PartnerNetworkView"),
  campaignTemplateQuickstart: ["tenant_campaign_templates", "validate_campaign_template_scope", "enable row level security"].every((label) => campaignTemplateMigration.includes(label)) && ["save_campaign_template", "delete_campaign_template", "targetAssignments"].every((label) => records.includes(label)) && ["campaignTemplates", "tenant_campaign_templates"].every((label) => overview.includes(label)) && ["Kampagnen-Schnellstart", "Wochenangebot", "Aktion", "Information", "Partnerwerbung", "Meine Vorlagen", "Vorlage speichern"].every((label) => campaignTemplates.includes(label)) && ["CampaignQuickStartDialog", "SaveCampaignTemplateDialog", "Schnellstart", "Als Vorlage speichern"].every((label) => portal.includes(label)) && ["campaign-template-grid", "campaign-quickstart-banner"].every((label) => templateCss.includes(label)),
  funnelStepHeaderLayout: campaignCss.includes(".funnel-current-step > span:first-child") && !campaignCss.includes(".funnel-current-step > span {"),
  editablePortalRecords: ["update_content", "update_display"].every((action) => records.includes(action) && portal.includes(action)) && ["ContentEditDialog", "DisplayEditDialog", "Änderungen live übernehmen", "(activate || isRunning)"].every((label) => portal.includes(label)) && !records.includes("müssen zuerst pausiert werden"),
  visibleRecordLabels: ["record-kind", "record-title-line", "record-assignment", "campaign-identity"].every((label) => portal.includes(label) && campaignCss.concat(read("src/portal/portal-records.css")).includes(label)),
};

console.log(JSON.stringify(checks, null, 2));
if (Object.values(checks).some((value) => !value)) process.exit(1);
