# Kampagnenvorlagen aktivieren und prüfen

Die Standardvorlagen **Wochenangebot**, **Aktion**, **Information** und **Partnerwerbung** funktionieren ohne zusätzliche Datenbankeinrichtung. Die Migration wird für eigene, wiederverwendbare Kundenvorlagen benötigt.

## 1. Migration ausführen

Im Supabase SQL Editor den vollständigen Inhalt von `supabase/migrations/20260908_campaign_templates.sql` ausführen. Erwartetes Ergebnis: `Success. No rows returned`.

Falls `20260907_partner_network.sql` noch nicht ausgeführt wurde, diese Migration zuerst vollständig ausführen.

## 2. Einrichtung kontrollieren

```sql
select
  to_regclass('swisscompact.tenant_campaign_templates') is not null as vorlagen,
  relrowsecurity as rls_aktiv
from pg_class
where oid = 'swisscompact.tenant_campaign_templates'::regclass;

select exists (
  select 1
  from pg_trigger
  where tgname = 'tenant_campaign_templates_validate_scope'
    and not tgisinternal
) as mandantenpruefung;
```

Erwartet werden bei `vorlagen`, `rls_aktiv` und `mandantenpruefung` jeweils `true`.

## 3. Portal testen

1. Unter **Kampagnen** auf **Schnellstart** klicken.
2. Eine Standardvorlage auswählen. Bildschirm, Inhalt und Zeitpunkt bleiben vor der Veröffentlichung kontrollierbar.
3. Bei einer vollständig eingerichteten Kampagne **Als Vorlage speichern** wählen.
4. Den Schnellstart erneut öffnen und die Vorlage unter **Meine Vorlagen** verwenden.
5. Kontrollieren, dass Bildschirm, Playlist und die bisherige Laufzeit übernommen wurden, Start und Ende aber erneut bestätigt werden müssen.
6. Eine Vorlage löschen und prüfen, dass die ursprüngliche Kampagne unverändert bleibt.

Gelöschte Bildschirme oder Inhalte werden beim Verwenden einer älteren Vorlage automatisch ausgelassen. Die Kampagne wird nie allein durch die Vorlagenauswahl veröffentlicht.
