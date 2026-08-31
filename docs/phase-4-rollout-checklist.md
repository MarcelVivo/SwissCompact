# Phase 4 – Auftragsakte sicher aktivieren

Die Anwendung erkennt automatisch, ob die Phase-4-Tabellen bereits vorhanden sind. Vor der Migration bleiben Portal und Dashboard funktionsfähig; die neue Auftragsakte zeigt lediglich einen Aktivierungshinweis.

## 1. Migration ausführen

Im Supabase SQL Editor **nur** den vollständigen Inhalt dieser Datei einfügen und ausführen:

`supabase/migrations/20260904_project_collaboration.sql`

Nicht die Markdown-Datei in den SQL Editor kopieren.

## 2. Datenmodell kontrollieren

```sql
select
  to_regclass('swisscompact.project_messages') is not null as nachrichten,
  to_regclass('swisscompact.project_deliverables') is not null as entwürfe,
  to_regclass('swisscompact.project_deliverable_versions') is not null as versionen,
  to_regclass('swisscompact.project_review_decisions') is not null as freigaben,
  to_regclass('swisscompact.project_revision_rounds') is not null as korrekturen,
  count(*) filter (where tenant_id is not null) as projekte_mit_portal,
  count(*) as projekte_gesamt
from swisscompact.projects;
```

Alle fünf Prüfwerte müssen `true` sein. Bei bestehenden verifizierten Portal-Kunden müssen die betreffenden Projekte eine `tenant_id` besitzen.

## 3. Ablauf mit einem Testauftrag prüfen

1. Im Dashboard unter **Projekte** die Auftragsakte öffnen.
2. Briefing speichern und eine kundensichtbare Nachricht senden.
3. Einen Bild-, Video- oder PDF-Entwurf hochladen.
4. Im Kundenportal unter **Meine Vorgänge** denselben Auftrag öffnen.
5. Datei öffnen und einmal einen Änderungswunsch senden.
6. Im Dashboard Korrekturumfang und gegebenenfalls Zusatzkosten festlegen.
7. Im Kundenportal Kosten bestätigen und danach eine neue Entwurfsversion freigeben.
8. Den freigegebenen Inhalt in Medienbibliothek, Archiv oder eine Kampagne übernehmen.

## 4. Erst danach deployen

Nach erfolgreichem Ende-zu-Ende-Test Anwendungscode deployen und den Ablauf nochmals in der Produktionsdomain prüfen.
