# Externe Alarmweiterleitung für kritische Störungen

Kritische Stripe- und Mux-Verarbeitungsfehler sowie manuell ausgelöste Testalarme werden ausserhalb des Dashboards weitergeleitet. Wiederholungen desselben Incident-Schlüssels werden standardmässig 15 Minuten zusammengefasst.

## 1. Migration

`supabase/migrations/20260921_critical_incident_alerting.sql` im SQL Editor ausführen.

## 2. Vercel

Mindestens E-Mail oder Webhook konfigurieren und danach neu deployen:

```text
RESEND_API_KEY=...
OPERATIONS_ALERT_EMAIL=kontakt@swisscompact.com
OPERATIONS_ALERT_COOLDOWN_MINUTES=15
```

Optional zusätzlich:

```text
OPERATIONS_ALERT_WEBHOOK_URL=https://...
OPERATIONS_ALERT_WEBHOOK_BEARER=...
```

Der Webhook muss HTTPS verwenden. Das Bearer-Secret bleibt serverseitig und erhält niemals ein `VITE_`-Präfix.

## 3. Produktiver Test

Als Hauptadmin **Dashboard → Systeme → Betriebsmeldungen → Alarmkanal testen** wählen. Es wird ausdrücklich ein Test-Incident erstellt. Danach prüfen:

- Alarm ist beim externen Empfänger angekommen.
- Im Dashboard steht beim Incident **Externer Alarm: zugestellt**.
- Unter **Zustellversuche** erscheint `critical_incident_alert` als zugestellt.
- Test-Incident anschliessend als erledigt markieren.
