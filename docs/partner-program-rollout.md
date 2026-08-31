# Partnerwerbung – sichere Aktivierung

Mit dem Partnerprogramm können zwei bestätigte SwissCompact-Kunden gegenseitig Werbung anbieten. Ein Partner erhält **keinen Zugriff auf fremde Bildschirme**. Der Empfänger muss jeden Inhalt zuerst übernehmen und wählt anschliessend Bildschirm und Zeitraum selbst.

## 1. Datenbank aktivieren

Im Supabase SQL Editor den **vollständigen Inhalt** von
`supabase/migrations/20260907_partner_network.sql` ausführen.

Erwartetes Resultat:

```text
Success. No rows returned
```

## 2. Datenmodell kontrollieren

Danach diesen Block im SQL Editor ausführen:

```sql
select
  to_regclass('swisscompact.tenant_partnerships') is not null as partnerschaften,
  to_regclass('swisscompact.tenant_partner_content_offers') is not null as werbeangebote,
  exists (
    select 1
    from pg_policies
    where schemaname = 'swisscompact'
      and tablename = 'tenant_partnerships'
      and policyname = 'tenant_partnerships_read'
  ) as partnerschaften_rls,
  exists (
    select 1
    from pg_policies
    where schemaname = 'swisscompact'
      and tablename = 'tenant_partner_content_offers'
      and policyname = 'tenant_partner_content_offers_read'
  ) as werbeangebote_rls;
```

Alle vier Werte müssen `true` sein.

## 3. Einfacher Funktionstest

Voraussetzung: Zwei aktive Kundenportale mit unterschiedlichen bestätigten Portal-E-Mails.

1. Im ersten Portal `Partnerwerbung` öffnen.
2. Portal-E-Mail des zweiten Betriebs eingeben und einladen.
3. Im zweiten Portal die Einladung annehmen.
4. Im ersten Portal ein technisch fertiges und freigegebenes Bild oder Video anbieten.
5. Im zweiten Portal das Angebot in die Mediathek übernehmen.
6. `Jetzt Bildschirm & Zeit wählen` anklicken und die normale Ausspielung fertigstellen.

Das erwartete Sicherheitsverhalten:

- Ohne Annahme erscheint der Inhalt nicht in der fremden Mediathek.
- Mit Annahme wird noch nichts automatisch auf einem Bildschirm veröffentlicht.
- Der Empfänger entscheidet selbst über Bildschirm, Start und Ende.
- Ein freigegebener Partnerinhalt kann beim Anbieter nicht endgültig gelöscht werden, solange der Empfänger ihn verwendet.
- Das Beenden der Partnerschaft entfernt keine bereits bewusst übernommenen Inhalte oder laufenden Kampagnen.

## 4. Technischer Überblick

```text
Partner A lädt ein
        ↓
Partner B bestätigt die Verbindung
        ↓
Partner A bietet freigegebenes Medium an
        ↓
Partner B prüft und übernimmt es
        ↓
Partner B wählt eigenen Bildschirm und Zeitraum
```

Die eigentliche Veröffentlichung bleibt damit immer im bestehenden, geprüften Kampagnenablauf des Bildschirmbesitzers.
