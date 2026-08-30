import Stripe from "stripe";
import { dashboardSupabase } from "../dashboard/auth.js";
import { json } from "../assistant/security.js";

export async function handleStripeWebhookPost(request: Request): Promise<Response> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secretKey || !webhookSecret) return json({ error: "Stripe ist nicht konfiguriert" }, { status: 503 });
  if (!signature) return json({ error: "Stripe-Signatur fehlt" }, { status: 400 });

  const stripe = new Stripe(secretKey);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return json({ error: "Ungültige Stripe-Signatur" }, { status: 400 });
  }
  const client = dashboardSupabase();
  if (!client) return json({ error: "Datenbank nicht konfiguriert" }, { status: 503 });
  await client.from("stripe_webhook_events").upsert({
    event_id: event.id,
    event_type: event.type,
    payload: { livemode: event.livemode, objectId: (event.data.object as { id?: string }).id || null },
  }, { onConflict: "event_id", ignoreDuplicates: true });

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") {
        const purchaseId = session.metadata?.purchaseId || "";
        if (!purchaseId) throw new Error("Stripe Session ohne purchaseId");
        const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "";
        const granted = await client.rpc("grant_ai_credit_purchase", { target_purchase: purchaseId, payment_intent: paymentIntent });
        if (granted.error) throw granted.error;
      }
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.purchaseId) await client.from("tenant_ai_credit_purchases").update({ status: "expired" }).eq("id", session.metadata.purchaseId).eq("status", "pending");
    }
    await client.from("stripe_webhook_events").update({ processed_at: new Date().toISOString(), error_message: null }).eq("event_id", event.id);
    return json({ received: true });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Webhook-Verarbeitung fehlgeschlagen";
    await client.from("stripe_webhook_events").update({ error_message: message.slice(0, 500) }).eq("event_id", event.id);
    console.error(`stripe webhook ${event.id}:`, reason);
    return json({ error: "Webhook konnte nicht verarbeitet werden" }, { status: 500 });
  }
}
