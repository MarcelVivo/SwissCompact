# Rechtsdokumente und Zustimmungen – sichere Inbetriebnahme

Die technische Verwaltung ersetzt keine rechtliche Prüfung. Solange nur die mitgelieferten Entwürfe vorhanden sind, erscheint im Kundenportal keine Zustimmung und kein Benutzer wird blockiert.

## 1. Migration ausführen

Den vollständigen Inhalt von `supabase/migrations/20260911_legal_compliance.sql` im Supabase SQL Editor ausführen.

Danach kontrollieren:

```sql
select
  to_regclass('swisscompact.legal_documents') is not null as rechtsdokumente,
  to_regclass('swisscompact.legal_acceptances') is not null as zustimmungen,
  exists (
    select 1 from pg_policies
    where schemaname = 'swisscompact'
      and tablename = 'legal_acceptances'
      and policyname = 'legal_acceptances_read'
  ) as zustimmungen_rls,
  exists (
    select 1 from pg_proc
    where proname = 'accept_legal_documents'
      and pronamespace = 'swisscompact'::regnamespace
  ) as sichere_zustimmungsfunktion;
```

Alle vier Werte müssen `true` sein.

## 2. Geprüfte Texte einsetzen

Die Migration erzeugt drei ausdrücklich nicht veröffentlichbare Arbeitsentwürfe. Nach der rechtlichen Prüfung werden Titel, Version, Zusammenfassung und vollständiger Inhalt ersetzt. Beispiel für die Nutzungsbedingungen:

```sql
update swisscompact.legal_documents
set version = '1.0',
    title = 'Nutzungsbedingungen Kundenportal',
    summary = 'Regelt die Nutzung des SwissCompact-Kundenportals.',
    content_markdown = $text$
HIER DEN VOLLSTÄNDIGEN GEPRÜFTEN TEXT EINFÜGEN
$text$,
    effective_at = now()
where document_type = 'terms'
  and status = 'draft';
```

Dasselbe kontrolliert für `privacy` und `data_processing` durchführen. Entwürfe dürfen beliebig bearbeitet werden; veröffentlichte Versionen sind technisch unveränderbar.

Im normalen Betrieb erfolgt dies ohne direkte SQL-Änderung im internen Dashboard unter **Sicherheit & Protokoll → Rechtsdokumente**. Nur der Hauptadmin kann dort Entwürfe anlegen oder bearbeiten.

## 3. Bewusst veröffentlichen

Die ID jedes geprüften Entwurfs kontrollieren:

```sql
select id, document_type, version, title, status, content_hash
from swisscompact.legal_documents
order by document_type, created_at desc;
```

Anschliessend jedes Dokument einzeln veröffentlichen. Bevorzugt wird im Dashboard die Aktion **Geprüfte Fassung veröffentlichen** verwendet. Sie verlangt:

1. die Bestätigung, dass exakt diese Fassung fachlich beziehungsweise rechtlich freigegeben wurde;
2. die ausdrückliche Eingabe `VERÖFFENTLICHEN`;
3. eine Hauptadmin-Sitzung mit starker Anmeldung.

Alternativ kann die Funktion im SQL Editor einzeln aufgerufen werden:

```sql
select swisscompact.publish_legal_document('DOKUMENT-ID-HIER'::uuid);
```

Eine bereits aktuelle Fassung desselben Dokumenttyps wird dabei als `superseded` aufbewahrt. Sie bleibt mitsamt früheren Zustimmungen einsehbar.

## 4. Portalablauf prüfen

1. Als Inhaber im Kundenportal anmelden.
2. Alle veröffentlichten Texte vollständig öffnen und bestätigen.
3. Unter **Einstellungen → Dokumente und Zustimmungen** Version, Zeitpunkt und Prüfsumme kontrollieren.
4. Als weiterer Benutzer anmelden. Persönliche Dokumente müssen durch diesen Benutzer erneut bestätigt werden.
5. Die Auftragsverarbeitung darf nur ein Inhaber oder Administrator für den Betrieb bestätigen.
6. Eine neue Entwurfsversion anlegen und veröffentlichen. Nur die neue aktuelle Version muss erneut bestätigt werden.

## 5. Sicherheitsverhalten

- Platzhalter und mit `ENTWURF` gekennzeichnete Inhalte können nicht veröffentlicht werden.
- Veröffentlichte Texte und Zustimmungsnachweise können nicht bearbeitet oder gelöscht werden.
- Jede Zustimmung enthält Portal, Benutzer beziehungsweise Mitgliedschaft, Version, Dokumenttyp, Zeitpunkt und kryptografische Prüfsumme.
- Das Portal bleibt vor der Migration und vor Veröffentlichung der finalen Texte funktionsfähig.
- Es werden keine IP-Adressen oder unnötigen Geräteinformationen im Zustimmungsnachweis gespeichert.
