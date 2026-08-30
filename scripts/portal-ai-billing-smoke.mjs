import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260901_portal_ai_billing.sql");
const auth = read("api/_lib/dashboard/auth.ts");
const imageRoute = read("api/dashboard/ai-image.ts");
const checkoutRoute = read("api/dashboard/ai-credits.ts");
const webhookRoute = read("api/stripe/webhook.ts");
const portal = read("src/portal/main.tsx");

for (const table of ["tenant_ai_credit_accounts", "tenant_ai_generation_jobs", "tenant_ai_credit_ledger", "tenant_ai_credit_purchases", "tenant_stripe_customers", "stripe_webhook_events"]) {
  assert.ok(migration.includes(`swisscompact.${table}`), `Tabelle ${table} fehlt`);
}
for (const fn of ["get_ai_credit_balance", "reserve_ai_credits", "refund_ai_credits", "grant_ai_credit_purchase"]) {
  assert.ok(migration.includes(`function swisscompact.${fn}`), `Credit-Funktion ${fn} fehlt`);
}
assert.match(migration, /revoke all on function[\s\S]*reserve_ai_credits[\s\S]*from public, anon, authenticated/, "Credit-Mutationen sind nicht ausreichend geschützt");
assert.match(imageRoute, /dashboardSupabase\(\)/, "KI-Route verwendet keinen geschützten Server-Client");
assert.ok(imageRoute.includes("reserve_ai_credits") && imageRoute.includes("refund_ai_credits"), "Credit-Reservierung oder Rückerstattung fehlt");
assert.match(imageRoute, /renderHeadline[\s\S]*swisscompact-media[\s\S]*tenant_content/, "Bildaufbereitung oder Medienablage fehlt");
assert.match(checkoutRoute, /checkout\.sessions\.create[\s\S]*idempotencyKey/, "Stripe Checkout ist nicht idempotent vorbereitet");
assert.match(webhookRoute, /constructEvent[\s\S]*grant_ai_credit_purchase/, "Stripe-Signatur oder Credit-Gutschrift fehlt");
assert.match(portal, /function AiImageDialog[\s\S]*Überschrift einblenden[\s\S]*Guthaben aufladen/, "KI-Bildstudio ist im Portal unvollständig");
assert.ok(auth.includes("Path=/api/dashboard"), "Dashboard-Cookie-Scope wurde unerwartet erweitert");
assert.ok(portal.includes('fetch("/api/dashboard/ai-image"') && portal.includes('api<{ checkoutUrl: string }>("/api/dashboard/ai-credits"'), "KI-Routen liegen ausserhalb des Session-Cookie-Pfads");

console.log(JSON.stringify({ aiImageStudio: true, transactionalCredits: true, stripeCheckout: true, signedWebhook: true, textOverlay: true }, null, 2));
