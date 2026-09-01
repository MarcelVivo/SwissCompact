# Kampagnenversionen ausrollen

## 1. Migration ausführen

Im Supabase SQL Editor den Inhalt von `supabase/migrations/20260910_campaign_versions.sql` vollständig ausführen.

Die Migration:

- erstellt für bestehende Kampagnen automatisch einen Ausgangsstand;
- speichert künftig vollständige Kampagnen-Snapshots;
- schützt alle Versionen mit Mandanten-RLS;
- stellt nur pausierte oder nicht laufende Kampagnen wieder her;
- legt den wiederhergestellten Stand immer als neuen Entwurf an.

## 2. Installation prüfen

```sql
select
  to_regclass('swisscompact.tenant_campaign_versions') is not null as versionstabelle,
  to_regprocedure('swisscompact.capture_campaign_version(uuid,text,uuid)') is not null as speichern,
  to_regprocedure('swisscompact.restore_campaign_version(uuid)') is not null as wiederherstellen;
```

Alle drei Werte müssen `true` sein.

## 3. Portaltest

1. Eine Kampagne vollständig öffnen, ändern und speichern.
2. In der Kampagnenliste **Versionen** öffnen.
3. Prüfen, ob Version, Zeitpunkt, Benutzer, Bildschirm- und Inhaltsanzahl stimmen.
4. Bei einer aktiven Kampagne prüfen, dass die Wiederherstellung gesperrt ist.
5. Kampagne pausieren und eine ältere Version auswählen.
6. Die zweistufige Bestätigung ausführen.
7. Prüfen, ob der frühere Stand als neuer Entwurf erscheint.
8. Den Entwurf kontrollieren und bewusst neu veröffentlichen.

Eine Wiederherstellung verändert niemals unbemerkt eine laufende Ausspielung.
