-- Persönliche Lesestände für registerbezogene Nachrichten und Benachrichtigungen.
begin;

create table if not exists swisscompact.notification_read_cursors (
  user_id uuid not null references auth.users(id) on delete cascade,
  audience text not null check (audience in ('portal','dashboard')),
  scope_key text not null check (char_length(scope_key) between 1 and 80),
  section text not null check (char_length(section) between 1 and 40),
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, audience, scope_key, section),
  check (
    (audience = 'portal' and section in ('status','records','partners','support','settings'))
    or
    (audience = 'dashboard' and section in ('pipeline','projects','production','support','systems','security'))
  )
);
create index if not exists notification_read_cursors_lookup_idx
  on swisscompact.notification_read_cursors(user_id, audience, scope_key);

create or replace function swisscompact.seed_notification_read_cursors()
returns trigger
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  target_user uuid;
  target_audience text;
  target_scope text;
  target_sections text[];
begin
  if tg_table_name = 'tenant_memberships' then
    if not new.active or new.access_status <> 'active' or new.verified_at is null then return new; end if;
    target_user := new.user_id;
    target_audience := 'portal';
    target_scope := new.tenant_id::text;
    target_sections := array['status','records','partners','support','settings'];
  else
    if not new.active then return new; end if;
    target_user := new.user_id;
    target_audience := 'dashboard';
    target_scope := 'dashboard';
    target_sections := array['pipeline','projects','production','support','systems','security'];
  end if;

  insert into swisscompact.notification_read_cursors (
    user_id, audience, scope_key, section
  )
  select target_user, target_audience, target_scope, section
  from unnest(target_sections) as section
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists tenant_memberships_seed_notification_cursors
  on swisscompact.tenant_memberships;
create trigger tenant_memberships_seed_notification_cursors
after insert or update of active, access_status, verified_at
on swisscompact.tenant_memberships
for each row execute function swisscompact.seed_notification_read_cursors();

drop trigger if exists dashboard_profiles_seed_notification_cursors
  on swisscompact.dashboard_profiles;
create trigger dashboard_profiles_seed_notification_cursors
after insert or update of active
on swisscompact.dashboard_profiles
for each row execute function swisscompact.seed_notification_read_cursors();

-- Bestehende Benutzer starten ohne historischen Rückstau. Ab der Migration
-- wird jede neu eintreffende Nachricht gegen diesen persönlichen Stand gezählt.
insert into swisscompact.notification_read_cursors (user_id, audience, scope_key, section)
select membership.user_id, 'portal', membership.tenant_id::text, section
from swisscompact.tenant_memberships membership
cross join unnest(array['status','records','partners','support','settings']) as section
where membership.active
  and membership.access_status = 'active'
  and membership.verified_at is not null
on conflict do nothing;

insert into swisscompact.notification_read_cursors (user_id, audience, scope_key, section)
select profile.user_id, 'dashboard', 'dashboard', section
from swisscompact.dashboard_profiles profile
cross join unnest(array['pipeline','projects','production','support','systems','security']) as section
where profile.active
on conflict do nothing;

drop function if exists swisscompact.mark_notification_section_read(text,text,text);
create or replace function swisscompact.mark_notification_section_read(
  target_audience text,
  target_scope text,
  target_section text,
  target_read_through timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  read_at timestamptz := least(coalesce(target_read_through, now()), now());
  portal_tenant uuid;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;

  if target_audience = 'portal' then
    if target_section not in ('status','records','partners','support','settings') then
      raise exception 'Ungültiger Portalbereich';
    end if;
    begin portal_tenant := target_scope::uuid;
    exception when invalid_text_representation then
      raise exception 'Ungültiger Portalbereich';
    end;
    if not swisscompact.is_tenant_member(portal_tenant) then
      raise exception 'Kein Zugriff auf dieses Kundenportal';
    end if;
  elsif target_audience = 'dashboard' then
    if target_scope <> 'dashboard'
      or target_section not in ('pipeline','projects','production','support','systems','security')
      or not exists (
        select 1
        from swisscompact.dashboard_profiles profile
        where profile.user_id = auth.uid()
          and profile.active
          and profile.role in ('owner_admin','admin','staff','advisor')
      ) then
      raise exception 'Kein Zugriff auf diesen Dashboardbereich';
    end if;
  else
    raise exception 'Ungültiger Benachrichtigungsbereich';
  end if;

  insert into swisscompact.notification_read_cursors (
    user_id, audience, scope_key, section, last_read_at, updated_at
  ) values (
    auth.uid(), target_audience, target_scope, target_section, read_at, read_at
  )
  on conflict (user_id, audience, scope_key, section) do update
  set last_read_at = greatest(notification_read_cursors.last_read_at, excluded.last_read_at),
      updated_at = excluded.updated_at;
  return read_at;
end;
$$;

alter table swisscompact.notification_read_cursors enable row level security;

drop policy if exists notification_read_cursors_read_own
  on swisscompact.notification_read_cursors;
create policy notification_read_cursors_read_own
on swisscompact.notification_read_cursors for select
using (user_id = auth.uid());

revoke all on function swisscompact.seed_notification_read_cursors(),
  swisscompact.mark_notification_section_read(text,text,text,timestamptz) from public, anon;
grant execute on function swisscompact.mark_notification_section_read(text,text,text,timestamptz)
  to authenticated, service_role;
grant select on swisscompact.notification_read_cursors to authenticated, service_role;
grant insert, update, delete on swisscompact.notification_read_cursors to service_role;

commit;
