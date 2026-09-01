-- Datenschutz-Self-Service: Datenexporte und kontrollierte Löschanfragen.
begin;

create table if not exists swisscompact.tenant_data_rights_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete restrict,
  membership_id uuid references swisscompact.tenant_memberships(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  request_type text not null
    check (request_type in ('personal_export','tenant_export','membership_deletion','tenant_deletion')),
  status text not null default 'submitted'
    check (status in ('submitted','reviewing','approved','processing','completed','rejected','cancelled')),
  reason text check (reason is null or char_length(reason) <= 2000),
  export_path text,
  export_expires_at timestamptz,
  retention_resolution jsonb not null default '{}'::jsonb
    check (jsonb_typeof(retention_resolution) = 'object'),
  review_note text check (review_note is null or char_length(review_note) <= 4000),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status <> 'completed'
    or request_type not in ('personal_export','tenant_export')
    or export_path is not null
  ),
  check (export_path is null or export_expires_at is not null)
);

create index if not exists tenant_data_rights_requests_tenant_idx
  on swisscompact.tenant_data_rights_requests(tenant_id, created_at desc);
create index if not exists tenant_data_rights_requests_requester_idx
  on swisscompact.tenant_data_rights_requests(requested_by, created_at desc);
create unique index if not exists tenant_data_rights_requests_personal_open_idx
  on swisscompact.tenant_data_rights_requests(tenant_id, requested_by, request_type)
  where request_type <> 'tenant_deletion'
    and status in ('submitted','reviewing','approved','processing');
create unique index if not exists tenant_data_rights_requests_tenant_deletion_open_idx
  on swisscompact.tenant_data_rights_requests(tenant_id)
  where request_type = 'tenant_deletion'
    and status in ('submitted','reviewing','approved','processing');

create or replace function swisscompact.protect_data_rights_request_scope()
returns trigger
language plpgsql
security definer
set search_path = swisscompact, public
as $$
begin
  if old.tenant_id is distinct from new.tenant_id
    or old.membership_id is distinct from new.membership_id
    or old.requested_by is distinct from new.requested_by
    or old.request_type is distinct from new.request_type
    or old.created_at is distinct from new.created_at then
    raise exception 'Identität und Umfang einer Datenschutzanfrage sind unveränderbar';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tenant_data_rights_requests_protect_scope
  on swisscompact.tenant_data_rights_requests;
create trigger tenant_data_rights_requests_protect_scope
before update on swisscompact.tenant_data_rights_requests
for each row execute function swisscompact.protect_data_rights_request_scope();

create or replace function swisscompact.create_data_rights_request(
  target_tenant uuid,
  target_request_type text,
  request_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  membership swisscompact.tenant_memberships%rowtype;
  created_request uuid;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
  if target_request_type not in ('personal_export','tenant_export','membership_deletion','tenant_deletion') then
    raise exception 'Ungültige Datenschutzanfrage';
  end if;
  if request_reason is not null and char_length(trim(request_reason)) > 2000 then
    raise exception 'Die Begründung ist zu lang';
  end if;

  select * into membership
  from swisscompact.tenant_memberships
  where tenant_id = target_tenant
    and user_id = auth.uid()
    and active
    and access_status = 'active'
    and verified_at is not null
  order by created_at
  limit 1;
  if membership.id is null then raise exception 'Kein bestätigter Portalzugriff'; end if;

  if target_request_type = 'tenant_export' and membership.role not in ('owner','admin') then
    raise exception 'Nur Inhaber und Administratoren dürfen Betriebsdaten exportieren';
  end if;
  if target_request_type = 'tenant_deletion' and membership.role <> 'owner' then
    raise exception 'Nur der Inhaber darf die Löschung des Kundenportals beantragen';
  end if;

  begin
    insert into swisscompact.tenant_data_rights_requests (
      tenant_id, membership_id, requested_by, request_type, reason
    ) values (
      target_tenant, membership.id, auth.uid(), target_request_type, nullif(trim(request_reason), '')
    ) returning id into created_request;
  exception when unique_violation then
    select id into created_request
    from swisscompact.tenant_data_rights_requests
    where tenant_id = target_tenant
      and request_type = target_request_type
      and (target_request_type = 'tenant_deletion' or requested_by = auth.uid())
      and status in ('submitted','reviewing','approved','processing')
    order by created_at desc
    limit 1;
  end;

  if created_request is null then raise exception 'Datenschutzanfrage konnte nicht erstellt werden'; end if;
  return created_request;
end;
$$;

create or replace function swisscompact.cancel_data_rights_request(target_request uuid)
returns uuid
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  cancelled_request uuid;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
  update swisscompact.tenant_data_rights_requests
  set status = 'cancelled', cancelled_at = now()
  where id = target_request
    and requested_by = auth.uid()
    and status = 'submitted'
  returning id into cancelled_request;
  if cancelled_request is null then
    raise exception 'Nur eine noch ungeprüfte eigene Anfrage kann zurückgezogen werden';
  end if;
  return cancelled_request;
end;
$$;

alter table swisscompact.tenant_data_rights_requests enable row level security;

drop policy if exists tenant_data_rights_requests_read
  on swisscompact.tenant_data_rights_requests;
create policy tenant_data_rights_requests_read
on swisscompact.tenant_data_rights_requests for select
using (
  swisscompact.is_dashboard_admin()
  or requested_by = auth.uid()
  or (
    request_type in ('tenant_export','tenant_deletion')
    and exists (
      select 1 from swisscompact.tenant_memberships membership
      where membership.tenant_id = tenant_data_rights_requests.tenant_id
        and membership.user_id = auth.uid()
        and membership.active
        and membership.access_status = 'active'
        and membership.verified_at is not null
        and membership.role in ('owner','admin')
    )
  )
);

revoke all on function swisscompact.protect_data_rights_request_scope(),
  swisscompact.create_data_rights_request(uuid,text,text),
  swisscompact.cancel_data_rights_request(uuid) from public, anon;
grant execute on function swisscompact.create_data_rights_request(uuid,text,text),
  swisscompact.cancel_data_rights_request(uuid) to authenticated, service_role;
grant select on swisscompact.tenant_data_rights_requests to authenticated, service_role;
grant insert, update, delete on swisscompact.tenant_data_rights_requests to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('swisscompact-exports', 'swisscompact-exports', false, 10485760, array['application/json'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;
