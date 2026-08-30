# Portal-Bildstudio und KI-Credits

Das Kundenportal erzeugt Displaymotive über die OpenAI Image API, legt optionale Überschriften serverseitig über das Motiv und speichert das Ergebnis in `swisscompact-media`. Verbrauchte Credits werden transaktional verbucht. Zusätzliche Credits werden über Stripe Checkout gekauft und erst nach einem signierten Webhook gutgeschrieben.

## Inbetriebnahme

1. Die Migration `supabase/migrations/20260901_portal_ai_billing.sql` in Supabase anwenden.
2. In Vercel folgende serverseitige Variablen setzen:
   - `OPENAI_API_KEY`
   - `OPENAI_IMAGE_MODEL=gpt-image-2` (optional, dies ist der Standard)
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `SITE_URL=https://<produktive-domain>`
3. In Stripe einen Webhook mit der Zieladresse `https://<produktive-domain>/api/dashboard/records?integration=stripe-webhook` anlegen.
4. Mindestens diese Stripe-Events abonnieren:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.expired`
5. Zuerst im Stripe-Testmodus einen Kauf vollständig durchführen. Credits dürfen erst nach der Webhook-Zustellung im Portal erscheinen.

## Standardwerte

| Paket | Monatlich enthaltene Credits |
| --- | ---: |
| Essential | 10 |
| Business | 30 |
| Enterprise | 100 |

| Credit-Paket | Credits | Preis |
| --- | ---: | ---: |
| Starter | 20 | CHF 9.00 |
| Studio | 60 | CHF 24.00 |
| Pro | 150 | CHF 49.00 |

Die Verkaufspakete stehen in `api/_lib/portal/ai-config.ts`. Qualitätskosten sind dort ebenfalls zentral konfiguriert: Entwurf 1, Standard 3 und Premium 10 Credits.

## Sicherheitsmodell

- OpenAI- und Stripe-Schlüssel verlassen den Server nie.
- Nur angemeldete Portalmitglieder mit Bearbeitungsrecht können Bilder erzeugen.
- Nur Inhaber und Admins können Credit-Pakete kaufen.
- Credit-Reservierung, Rückerstattung und Stripe-Gutschrift laufen als gesperrte Datenbanktransaktionen.
- Generierungs- und Checkout-Aufträge verwenden Idempotency-IDs gegen Doppelbelastungen.
- Stripe-Gutschriften erfolgen ausschließlich nach erfolgreicher Webhook-Signaturprüfung.
- Fehlgeschlagene OpenAI-, Moderations-, Verarbeitungs- oder Storage-Aufträge erstatten reservierte Credits automatisch.
