import Stripe from "stripe";
import { authorizePortal, dashboardSupabase, isResponse } from "../_lib/dashboard/auth.js";
import { cleanText, json, validatePublicPost } from "../_lib/assistant/security.js";
import { AI_CREDIT_PACKAGES, type AiCreditPackage } from "../_lib/portal/ai-config.js";

export const config = { runtime: "nodejs", maxDuration: 20 };

function portalOrigin(request: Request): string {
  if (process.env.SITE_URL) {
    try { return new URL(process.env.SITE_URL).origin; } catch { /* use request */ }
  }
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return host ? `${protocol}://${host}` : new URL(request.url).origin;
}

export async function POST(request: Request): Promise<Response> {
  const guard = validatePublicPost(request, {
    key: "portal-ai-credit-checkout",
    limit: 10,
    windowMs: 30 * 60_000,
    contentTypes: ["application/json"],
    maxBytes: 2_000,
  });
  if (guard) return guard;
  const authorized = await authorizePortal(request);
  if (isResponse(authorized)) return authorized;
  const { profile } = authorized;
  if (!(["owner", "admin"] as string[]).includes(profile.role)) return json({ error: "Nur Inhaber oder Admins können Credits kaufen" }, { status: 403 });
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || !process.env.STRIPE_WEBHOOK_SECRET) {
    return json({ error: "Stripe ist noch nicht vollständig konfiguriert" }, { status: 503 });
  }
  const admin = dashboardSupabase();
  if (!admin) return json({ error: "Datenbank nicht konfiguriert" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "Ungültige Anfrage" }, { status: 400 }); }
  const packageCode = cleanText(body.packageCode, 40) as AiCreditPackage;
  const selected = AI_CREDIT_PACKAGES[packageCode];
  if (!selected) return json({ error: "Unbekanntes Credit-Paket" }, { status: 400 });

  const stripe = new Stripe(secretKey);
  const mapping = await admin.from("tenant_stripe_customers").select("stripe_customer_id").eq("tenant_id", profile.tenantId).maybeSingle();
  if (mapping.error) return json({ error: "Stripe-Kundenzuordnung konnte nicht geladen werden" }, { status: 503 });
  let customerId = mapping.data?.stripe_customer_id || "";
  if (!customerId) {
    try {
      const customer = await stripe.customers.create({
        email: profile.email,
        name: profile.tenantName,
        metadata: { tenantId: profile.tenantId, tenantSlug: profile.tenantSlug },
      }, { idempotencyKey: `tenant-customer-${profile.tenantId}` });
      customerId = customer.id;
    } catch (reason) {
      console.error("stripe customer:", reason);
      return json({ error: "Stripe ist momentan nicht erreichbar" }, { status: 502 });
    }
    const stored = await admin.from("tenant_stripe_customers").upsert({ tenant_id: profile.tenantId, stripe_customer_id: customerId, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
    if (stored.error) return json({ error: "Stripe-Kundenzuordnung konnte nicht gespeichert werden" }, { status: 503 });
  }

  const purchase = await admin.from("tenant_ai_credit_purchases").insert({
    tenant_id: profile.tenantId,
    requested_by: profile.userId,
    package_code: packageCode,
    credits: selected.credits,
    amount_minor: selected.amountMinor,
    currency: selected.currency,
    status: "pending",
  }).select("id").single();
  if (purchase.error || !purchase.data) return json({ error: "Credit-Kauf konnte nicht vorbereitet werden" }, { status: 503 });

  const origin = portalOrigin(request);
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      client_reference_id: profile.tenantId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: selected.currency,
          unit_amount: selected.amountMinor,
          product_data: { name: `${selected.credits} SwissCompact KI-Credits`, metadata: { packageCode } },
        },
      }],
      metadata: { tenantId: profile.tenantId, purchaseId: purchase.data.id, packageCode, credits: String(selected.credits) },
      success_url: `${origin}/portal?credits=success`,
      cancel_url: `${origin}/portal?credits=cancelled`,
      allow_promotion_codes: true,
    }, { idempotencyKey: `ai-credit-purchase-${purchase.data.id}` });
    await admin.from("tenant_ai_credit_purchases").update({ stripe_session_id: session.id }).eq("id", purchase.data.id).eq("tenant_id", profile.tenantId);
    return json({ ok: true, checkoutUrl: session.url });
  } catch (reason) {
    await admin.from("tenant_ai_credit_purchases").update({ status: "expired" }).eq("id", purchase.data.id).eq("tenant_id", profile.tenantId);
    console.error("stripe checkout:", reason);
    return json({ error: "Stripe Checkout konnte nicht geöffnet werden" }, { status: 502 });
  }
}
