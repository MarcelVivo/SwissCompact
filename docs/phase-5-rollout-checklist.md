# Phase 5 – sichere Inbetriebnahme

## 1. Migration

Den vollständigen Inhalt von `supabase/migrations/20260905_safe_display_delivery.sql` im Supabase SQL Editor ausführen. Nur SQL kopieren, nicht diesen Markdown-Text.

## 2. Datenmodell kontrollieren

```sql
select
  to_regclass('swisscompact.tenant_display_config_versions') is not null as versionen,
  to_regclass('swisscompact.tenant_display_test_publications') is not null as testveroeffentlichungen,
  to_regclass('swisscompact.tenant_display_alerts') is not null as warnungen,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'swisscompact' and table_name = 'tenant_displays'
      and column_name = 'fallback_content_id'
  ) as ersatzinhalt,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'swisscompact' and table_name = 'tenant_campaigns'
      and column_name = 'priority'
  ) as kampagnenprioritaet;
```

Alle fünf Werte müssen `true` sein.

## 3. Erst danach deployen

1. Portal öffnen und bei einem Bildschirm „Sicher veröffentlichen“ wählen.
2. Gerätevorschau öffnen.
3. Freigegebenen Ersatzinhalt speichern.
4. Eine Kampagne zehn Minuten auf genau diesem Bildschirm testen.
5. Prüfen, ob der Player die neue Version bestätigt.
6. Test beenden und eine vorherige Version wiederherstellen.
7. Player kurz vom Netz trennen und den Ersatzinhalt kontrollieren.
