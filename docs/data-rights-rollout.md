# Datenexport, Aufbewahrung und Löschanfragen

Diese Funktion stellt einen technischen Datenschutz-Self-Service bereit. Die konkrete rechtliche Beurteilung von Aufbewahrungsfristen und Löschpflichten muss vor dem Abschluss einer Anfrage durch SwissCompact erfolgen.

## 1. Migration ausführen

Den vollständigen Inhalt von `supabase/migrations/20260912_data_rights.sql` im Supabase SQL Editor ausführen.

Danach kontrollieren:

```sql
select
  to_regclass('swisscompact.tenant_data_rights_requests') is not null as anfragen,
  exists (
    select 1 from storage.buckets
    where id = 'swisscompact-exports' and public = false
  ) as privater_export_bucket,
  exists (
    select 1 from pg_proc
    where proname = 'create_data_rights_request'
      and pronamespace = 'swisscompact'::regnamespace
  ) as sichere_anfragefunktion;
```

Alle drei Werte müssen `true` sein.

## 2. Rollen und Umfang

- Jeder bestätigte Portalbenutzer kann seine persönlichen Daten exportieren und die Löschung seines Zugangs beantragen.
- Inhaber und Administratoren können die Daten des gesamten Kundenportals exportieren.
- Nur ein Inhaber kann die Löschung des vollständigen Kundenportals beantragen.
- Persönliche Exporte sind ausschließlich für die anfragende Person sichtbar.
- Betriebliche Anfragen sind für Inhaber und Administratoren des betroffenen Portals sichtbar.

## 3. Sichere Exporte

- Exportdateien werden ausschließlich serverseitig erzeugt.
- Dateien liegen im privaten Bucket `swisscompact-exports`.
- Ein Download-Link ist jeweils nur 15 Minuten gültig.
- Nach 24 Stunden erzeugt das Portal keinen neuen Download-Link mehr.
- Die Exportdatei enthält keine Geräte-, Sitzungs-, Pairing- oder Zugriffstoken.
- Persönliche und betriebliche Exporte sind getrennt.

## 4. Löschablauf

Löschanfragen durchlaufen kontrollierte Status:

1. Eingegangen
2. In Prüfung
3. Freigegeben
4. In Umsetzung
5. Abgeschlossen oder abgelehnt

Der Status **Abgeschlossen** darf im internen Dashboard erst gesetzt werden, nachdem die tatsächlichen Lösch- oder Anonymisierungsschritte und verbleibende Aufbewahrung dokumentiert wurden. Die Anwendung löscht niemals automatisch ein Kundenportal, Rechnungen, Zustimmungsnachweise oder Auditdaten.

## 5. Funktionstest

1. Als Portalbenutzer unter **Einstellungen → Meine Daten & Datenschutz** eine persönliche Datenkopie erstellen.
2. JSON-Datei herunterladen und Portal, anfragende Person sowie Datengruppen kontrollieren.
3. Als Inhaber zusätzlich einen Portal-Export erstellen.
4. Eine Löschanfrage mit der angezeigten Bestätigungsphrase einreichen.
5. Im internen Dashboard unter **Sicherheit → Datenschutzanfragen** die Prüfung beginnen.
6. Eine dokumentierte Rückmeldung speichern und kontrollieren, dass der neue Status im Kundenportal erscheint.
