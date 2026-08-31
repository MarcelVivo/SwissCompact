-- Phase 5: sichere Veröffentlichung, Testbetrieb, Rollback und Display-Überwachung.
begin;

alter table swisscompact.tenant_campaigns
  add column if not exists priority integer not null default 50
    check (priority between 0 and 100);

alter table swisscompact.tenant_displays
  add column if not exists fallback_content_id uuid references swisscompact.tenant_content(id) on delete set null,
  add column if not exists last_acknowledged_version bigint,
  add column if not exists last_delivery_at timestamptz,
  add column if not exists delivery_status text not null default 'pending'
    check (delivery_status in ('pending','delivered','error','offline')),
  add column if not exists last_delivery_error text;

create table if not exists swisscompact.tenant_display_config_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  display_id uuid not null references swisscompact.tenant_displays(id) on delete cascade,
  version bigint not null check (version > 0),
  source text not null default 'system'
    check (source in ('system','campaign','test','rollback','fallback')),
  campaign_id uuid references swisscompact.tenant_campaigns(id) on delete set null,
  configuration jsonb not null default '{}'::jsonb,
  state text not null default 'active'
    check (state in ('active','superseded','test','rolled_back')),
  previous_version bigint,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (display_id, version)
);
create index if not exists tenant_display_config_versions_recent_idx
  on swisscompact.tenant_display_config_versions(display_id, version desc);

create table if not exists swisscompact.tenant_display_test_publications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  display_id uuid not null references swisscompact.tenant_displays(id) on delete cascade,
  campaign_id uuid not null references swisscompact.tenant_campaigns(id) on delete cascade,
  configuration_version bigint not null,
  previous_version bigint,
  status text not null default 'active'
    check (status in ('active','completed','cancelled','expired')),
  expires_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists tenant_display_test_publications_one_active_idx
  on swisscompact.tenant_display_test_publications(display_id)
  where status = 'active';

create table if not exists swisscompact.tenant_display_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  display_id uuid not null references swisscompact.tenant_displays(id) on delete cascade,
  kind text not null check (kind in ('offline','delivery_error','cache_error','campaign_conflict')),
  severity text not null default 'warning' check (severity in ('info','warning','error')),
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (display_id, kind)
);
create index if not exists tenant_display_alerts_open_idx
  on swisscompact.tenant_display_alerts(tenant_id, status, severity, last_seen_at desc);

create or replace function swisscompact.validate_display_delivery_scope()
returns trigger language plpgsql security definer set search_path = swisscompact, public as $$
declare linked_campaign uuid;
begin
  if not exists (
    select 1 from swisscompact.tenant_displays display
    where display.id = new.display_id and display.tenant_id = new.tenant_id
  ) then
    raise exception 'Bildschirm und Kundenportal gehören nicht zusammen';
  end if;
  linked_campaign := nullif(to_jsonb(new)->>'campaign_id', '')::uuid;
  if linked_campaign is not null and not exists (
    select 1 from swisscompact.tenant_campaigns campaign
    where campaign.id = linked_campaign and campaign.tenant_id = new.tenant_id
  ) then
    raise exception 'Kampagne und Kundenportal gehören nicht zusammen';
  end if;
  return new;
end;
$$;

drop trigger if exists tenant_display_config_versions_validate_scope on swisscompact.tenant_display_config_versions;
create trigger tenant_display_config_versions_validate_scope before insert or update
on swisscompact.tenant_display_config_versions for each row execute function swisscompact.validate_display_delivery_scope();
drop trigger if exists tenant_display_test_publications_validate_scope on swisscompact.tenant_display_test_publications;
create trigger tenant_display_test_publications_validate_scope before insert or update
on swisscompact.tenant_display_test_publications for each row execute function swisscompact.validate_display_delivery_scope();
drop trigger if exists tenant_display_alerts_validate_scope on swisscompact.tenant_display_alerts;
create trigger tenant_display_alerts_validate_scope before insert or update
on swisscompact.tenant_display_alerts for each row execute function swisscompact.validate_display_delivery_scope();

create or replace function swisscompact.validate_display_fallback()
returns trigger language plpgsql security definer set search_path = swisscompact, public as $$
begin
  if new.fallback_content_id is not null and not exists (
    select 1 from swisscompact.tenant_content content
    where content.id = new.fallback_content_id
      and content.tenant_id = new.tenant_id
      and content.status in ('approved','published')
  ) then
    raise exception 'Der Ersatzinhalt muss freigegeben sein und zu diesem Kunden gehören';
  end if;
  return new;
end;
$$;
drop trigger if exists tenant_displays_validate_fallback on swisscompact.tenant_displays;
create trigger tenant_displays_validate_fallback before insert or update of fallback_content_id
on swisscompact.tenant_displays for each row execute function swisscompact.validate_display_fallback();

create or replace function swisscompact.create_display_configuration_version(
  target_display uuid,
  next_configuration jsonb,
  version_source text default 'system',
  source_campaign uuid default null,
  version_state text default 'active'
)
returns bigint
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  linked_tenant uuid;
  previous bigint;
  next_version bigint;
begin
  select tenant_id, coalesce(configuration_version, 0)
    into linked_tenant, previous
  from swisscompact.tenant_displays
  where id = target_display
  for update;

  if linked_tenant is null then raise exception 'Bildschirm nicht gefunden'; end if;
  if auth.role() <> 'service_role' and not swisscompact.can_edit_tenant(linked_tenant) then
    raise exception 'Kein Bearbeitungszugriff auf diesen Bildschirm';
  end if;
  if version_source not in ('system','campaign','test','rollback','fallback') then
    raise exception 'Ungültige Versionsquelle';
  end if;
  if version_state not in ('active','test','rolled_back') then
    raise exception 'Ungültiger Versionsstatus';
  end if;

  next_version := greatest(previous + 1, 1);
  update swisscompact.tenant_display_config_versions
  set state = 'superseded'
  where display_id = target_display and state in ('active','test','rolled_back');

  insert into swisscompact.tenant_display_config_versions (
    tenant_id, display_id, version, source, campaign_id, configuration,
    state, previous_version, created_by
  ) values (
    linked_tenant, target_display, next_version, version_source, source_campaign,
    coalesce(next_configuration, '{}'::jsonb), version_state, nullif(previous, 0), auth.uid()
  );

  update swisscompact.tenant_displays
  set configuration_version = next_version,
      delivery_status = 'pending',
      last_delivery_error = null,
      updated_at = now()
  where id = target_display;

  return next_version;
end;
$$;

create or replace function swisscompact.refresh_display_delivery_health(target_tenant uuid)
returns void
language plpgsql
security definer
set search_path = swisscompact, public
as $$
begin
  if auth.role() <> 'service_role' and not swisscompact.is_tenant_member(target_tenant) then
    raise exception 'Zugriff verweigert';
  end if;

  update swisscompact.tenant_displays
  set delivery_status = 'offline'
  where tenant_id = target_tenant
    and status not in ('provisioning','retired')
    and (last_seen_at is null or last_seen_at < now() - interval '90 seconds');

  insert into swisscompact.tenant_display_alerts (
    tenant_id, display_id, kind, severity, status, message, last_seen_at
  )
  select tenant_id, id, 'offline', 'warning', 'open',
    'Der Bildschirm meldet sich seit mehr als 90 Sekunden nicht mehr.', now()
  from swisscompact.tenant_displays
  where tenant_id = target_tenant and delivery_status = 'offline'
  on conflict (display_id, kind) do update set
    status = 'open', message = excluded.message, last_seen_at = now(), resolved_at = null;

  update swisscompact.tenant_display_alerts alert
  set status = 'resolved', resolved_at = now(), last_seen_at = now()
  from swisscompact.tenant_displays display
  where alert.display_id = display.id
    and alert.tenant_id = target_tenant
    and alert.kind = 'offline'
    and alert.status <> 'resolved'
    and display.last_seen_at >= now() - interval '90 seconds';
end;
$$;

alter table swisscompact.tenant_display_config_versions enable row level security;
alter table swisscompact.tenant_display_test_publications enable row level security;
alter table swisscompact.tenant_display_alerts enable row level security;

drop policy if exists tenant_display_config_versions_read on swisscompact.tenant_display_config_versions;
create policy tenant_display_config_versions_read on swisscompact.tenant_display_config_versions for select
using (swisscompact.is_tenant_member(tenant_id));
drop policy if exists tenant_display_config_versions_write on swisscompact.tenant_display_config_versions;
create policy tenant_display_config_versions_write on swisscompact.tenant_display_config_versions for all
using (swisscompact.can_edit_tenant(tenant_id)) with check (swisscompact.can_edit_tenant(tenant_id));

drop policy if exists tenant_display_test_publications_read on swisscompact.tenant_display_test_publications;
create policy tenant_display_test_publications_read on swisscompact.tenant_display_test_publications for select
using (swisscompact.is_tenant_member(tenant_id));
drop policy if exists tenant_display_test_publications_write on swisscompact.tenant_display_test_publications;
create policy tenant_display_test_publications_write on swisscompact.tenant_display_test_publications for all
using (swisscompact.can_edit_tenant(tenant_id)) with check (swisscompact.can_edit_tenant(tenant_id));

drop policy if exists tenant_display_alerts_read on swisscompact.tenant_display_alerts;
create policy tenant_display_alerts_read on swisscompact.tenant_display_alerts for select
using (swisscompact.is_tenant_member(tenant_id));
drop policy if exists tenant_display_alerts_write on swisscompact.tenant_display_alerts;
create policy tenant_display_alerts_write on swisscompact.tenant_display_alerts for all
using (swisscompact.can_edit_tenant(tenant_id)) with check (swisscompact.can_edit_tenant(tenant_id));

revoke all on function swisscompact.validate_display_fallback(),
  swisscompact.validate_display_delivery_scope(),
  swisscompact.create_display_configuration_version(uuid,jsonb,text,uuid,text),
  swisscompact.refresh_display_delivery_health(uuid) from public, anon;
grant execute on function swisscompact.create_display_configuration_version(uuid,jsonb,text,uuid,text),
  swisscompact.refresh_display_delivery_health(uuid) to authenticated, service_role;
grant select on swisscompact.tenant_display_config_versions,
  swisscompact.tenant_display_test_publications, swisscompact.tenant_display_alerts
  to authenticated, service_role;
grant insert, update, delete on swisscompact.tenant_display_test_publications,
  swisscompact.tenant_display_alerts to authenticated, service_role;
grant insert, update, delete on swisscompact.tenant_display_config_versions to service_role;

commit;
