# Bildschirmgruppen und Sammelaktionen aktivieren

Suche, Status-, Standort- und Formatfilter sowie die Mehrfachauswahl funktionieren direkt nach dem Portal-Deployment. Dauerhaft gespeicherte Gruppen benötigen einmalig die Migration `20260909_display_groups.sql`.

## 1. Migration ausführen

Im Supabase SQL Editor den vollständigen Inhalt von `supabase/migrations/20260909_display_groups.sql` ausführen. Erwartetes Ergebnis: `Success. No rows returned`.

## 2. Einrichtung kontrollieren

```sql
select
  to_regclass('swisscompact.tenant_display_groups') is not null as gruppen,
  to_regclass('swisscompact.tenant_display_group_members') is not null as mitglieder;

select
  has_function_privilege(
    'authenticated',
    'swisscompact.save_display_group(uuid,uuid,text,text,uuid[])',
    'execute'
  ) as gruppenfunktion;
```

Erwartet werden bei `gruppen`, `mitglieder` und `gruppenfunktion` jeweils `true`.

## 3. Portal testen

1. **Bildschirme** öffnen und nach Name oder Standort suchen.
2. Status, Standort und Ausrichtung filtern.
3. Zwei Bildschirme markieren und **+ Gruppe erstellen** wählen.
4. Die gespeicherte Gruppe oben als Filter öffnen und danach **Gruppe bearbeiten** testen.
5. Mehrere Bildschirme markieren und **Kampagne erstellen** wählen. Der Kampagnenassistent muss mit diesen Bildschirmen bei der Inhaltsauswahl öffnen.
6. Einen freigegebenen Ersatzinhalt für mehrere Bildschirme anwenden.
7. Im Kampagnenassistenten unter **Wo?** eine vollständige Gruppe auswählen und wieder abwählen.

Eine Gruppe kann gelöscht werden, ohne dass Bildschirme, Inhalte oder Kampagnen gelöscht werden. Sammelaktionen werden serverseitig nochmals auf das angemeldete Kundenportal begrenzt.
