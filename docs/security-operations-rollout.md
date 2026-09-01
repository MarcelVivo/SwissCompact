# Sicherheit und Betriebsreife – Inbetriebnahme

Dieses Runbook nimmt das persönliche Sicherheitscenter, das Betriebsmonitoring und kontrollierte Wiederherstellungstests in Betrieb. Es verändert oder überschreibt keine produktiven Daten.

## 1. Migrationen ausführen

Im Supabase SQL Editor in dieser Reihenfolge vollständig ausführen:

1. `supabase/migrations/20260913_auth_security.sql`
2. `supabase/migrations/20260914_operational_readiness.sql`

Danach prüfen:

```sql
select
  to_regclass('swisscompact.user_security_sessions') is not null as sitzungen,
  to_regclass('swisscompact.operational_incidents') is not null as meldungen,
  to_regclass('swisscompact.operational_delivery_attempts') is not null as zustellversuche,
  to_regclass('swisscompact.operational_recovery_drills') is not null as wiederherstellungstests,
  exists (
    select 1 from pg_proc
    where proname = 'report_operational_incident'
      and pronamespace = 'swisscompact'::regnamespace
  ) as sichere_meldefunktion;
```

Alle fünf Werte müssen `true` sein.

## 2. Sicherheitscenter konfigurieren und testen

1. Eine lange, zufällige Umgebungsvariable `SECURITY_IP_HASH_SALT` setzen. Es werden keine IP-Adressen gespeichert, sondern nur gesalzene Prüfsummen.
2. In Supabase Auth die Passkey-Funktion aktivieren und die produktive Relying-Party-Domain sowie erlaubte Origins kontrollieren. Passkeys sind in der verwendeten Supabase-Schnittstelle noch als experimentell gekennzeichnet und müssen nach SDK-Updates erneut getestet werden.
3. Im Kundenportal unter **Einstellungen → Sicherheitscenter** einen Authenticator einrichten.
4. Abmelden und die Passwortanmeldung mit dem sechsstelligen Zusatzcode prüfen.
5. Wenn das Gerät Passkeys unterstützt, einen Passkey registrieren, abmelden und die Passkey-Anmeldung prüfen.
6. In einem zweiten Browser anmelden und danach **Andere abmelden** ausführen. Die aktuelle Sitzung muss bestehen bleiben, die zweite Sitzung darf sich nicht mehr erneuern.
7. Dieselben Grundfälle für das interne Dashboard kontrollieren.

Die Geräteliste ist eine datensparsame Anwendungshistorie der letzten 30 Tage. Supabase stellt clientseitig keine sichere Einzelabmeldung beliebiger fremder Sitzungs-IDs bereit; deshalb meldet die Aktion bewusst alle anderen Sitzungen gemeinsam ab.

## 3. Betriebsmonitoring prüfen

Das Dashboard zeigt unter **Systeme & Betriebsreife**:

- offene Anwendungs- und Integrationsmeldungen;
- E-Mail-, Webhook-, Export- und Medien-Zustellversuche;
- bestehende Display-, Medien-, Stripe- und KI-Fehler;
- geplante und abgeschlossene Wiederherstellungstests.

Testfälle:

1. Eine Portal-Einladung senden und den Zustellnachweis kontrollieren.
2. Ein Stripe- oder Mux-Testereignis zustellen und den Webhook-Nachweis kontrollieren.
3. Einen Portal-Datenexport erzeugen und den Exportnachweis kontrollieren.
4. Eine Teststörung als **Gesehen** markieren und danach abschliessen.

Für Alarmierung ausserhalb des Dashboards zusätzlich einen Supabase Log Drain oder den eingesetzten Hosting-Monitor konfigurieren. Geheimnisse und personenbezogene Inhalte dürfen nie in Meldungstexten oder Metadaten landen.

## 4. Wiederherstellungstest durchführen

Ein Test wird niemals direkt in die Produktionsdatenbank zurückgespielt.

1. Im Dashboard **Systeme & Betriebsreife → Test planen** öffnen.
2. Ein separates Supabase-Projekt oder eine isolierte Staging-Umgebung wählen.
3. Das gewünschte Datenbank-Backup beziehungsweise den Wiederherstellungspunkt dort einspielen.
4. Storage-Dateien separat aus der eigenen Sicherung wiederherstellen. Supabase-Datenbank-Backups enthalten die Storage-Objekte nicht.
5. Mindestens Tabellen/Daten, Anmeldung/RLS, Storage-Stichproben, Player-Konfiguration und Integrationen prüfen.
6. Dauer, Ergebnis, geprüfte Kontrollen, Abweichungen und einen Beleg im Dashboard dokumentieren.
7. Das isolierte Testsystem nach der Beweissicherung kontrolliert stilllegen.

Ein Eintrag darf nur als bestanden oder fehlgeschlagen abgeschlossen werden, wenn ein Testprotokoll und mindestens drei konkrete Kontrollen vorliegen. Das Dashboard führt den Nachweis; die eigentliche Wiederherstellung wird bewusst über die Backup-Werkzeuge der Infrastruktur ausgeführt.

## 5. Empfohlener Rhythmus

- monatlich: offene kritische Meldungen und fehlgeschlagene Zustellungen prüfen;
- quartalsweise: Datenbank-Wiederherstellung in einem isolierten Projekt;
- halbjährlich: vollständiger Wiederanlauf inklusive Storage, Auth, Player und Integrationen;
- nach jeder wesentlichen Auth-, Storage- oder Datenmodelländerung: betroffene Sicherheits- und Wiederherstellungstests wiederholen.
