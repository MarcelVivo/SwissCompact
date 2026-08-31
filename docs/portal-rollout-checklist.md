# Portal-Verifizierung – sichere Inbetriebnahme

Die Migration `20260903_verified_portal_customers.sql` darf erst nach dieser Bestandsprüfung ausgeführt werden. Sie läuft transaktional und bricht bei mehrdeutigen oder unsicheren Zuordnungen ab.

## 1. Bestandsprüfung vor der Migration

Im Supabase SQL Editor ausführen:

```sql
select
  tenant.id as tenant_id,
  tenant.name as portal,
  (
    select count(*)
    from swisscompact.tenant_memberships membership
    join auth.users portal_user on portal_user.id = membership.user_id
    where membership.tenant_id = tenant.id
      and membership.active
      and membership.role in ('owner','admin')
      and portal_user.email_confirmed_at is not null
  ) as bestaetigte_inhaber_admins,
  (
    select string_agg(portal_user.email, ', ' order by portal_user.email)
    from swisscompact.tenant_memberships membership
    join auth.users portal_user on portal_user.id = membership.user_id
    where membership.tenant_id = tenant.id
      and membership.active
      and membership.role in ('owner','admin')
  ) as portal_benutzer,
  (
    select count(*)
    from swisscompact.clients client
    where lower(trim(client.company_name)) = lower(trim(tenant.name))
       or lower(client.email) in (
         select lower(portal_user.email)
         from swisscompact.tenant_memberships membership
         join auth.users portal_user on portal_user.id = membership.user_id
         where membership.tenant_id = tenant.id
           and membership.active
           and membership.role in ('owner','admin')
       )
  ) as passende_kundenkarteien
from swisscompact.tenants tenant
where tenant.status = 'active'
order by tenant.created_at;
```

Für jedes aktive Portal gilt:

- `bestaetigte_inhaber_admins` ist mindestens 1.
- `passende_kundenkarteien` ist 0 oder 1.
- Bei 0 legt die Migration eine Bestandskundenkartei an.
- Bei mehr als 1 müssen doppelte oder mehrdeutige Kundenkarteien zuerst bereinigt werden.

## 2. Migration ausführen

Den vollständigen Inhalt von `supabase/migrations/20260903_verified_portal_customers.sql` im SQL Editor ausführen. Bei einem Fehler nichts teilweise korrigieren: Ursache beheben und die vollständige Migration erneut ausführen.

## 3. Kontrolle nach der Migration

```sql
select
  tenant.name as portal,
  tenant.status,
  client.company_name as kundenkartei,
  client.lifecycle,
  client.portal_verified_at,
  count(*) filter (
    where membership.access_status = 'active'
      and membership.verified_at is not null
  ) as aktive_bestaetigte_benutzer
from swisscompact.tenants tenant
left join swisscompact.clients client on client.id = tenant.client_id
left join swisscompact.tenant_memberships membership on membership.tenant_id = tenant.id
group by tenant.id, client.id
order by tenant.created_at;
```

Jedes aktive Portal benötigt eine Kundenkartei mit Status `customer`, einen Zeitpunkt in `portal_verified_at` und mindestens einen aktiven bestätigten Benutzer.

## 4. Erst danach deployen

1. Anwendungscode nach `main` pushen.
2. Production-Deployment ohne alten Build-Cache starten.
3. Login eines bestätigten Kunden testen.
4. Login eines gesperrten oder unbestätigten Kontos testen.
5. Produktionsanfrage absenden und Verknüpfung in Kundenkartei und Auftragstrichter prüfen.

