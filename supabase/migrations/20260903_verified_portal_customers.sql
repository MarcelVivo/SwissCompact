-- Ein Kundenportal gehört zwingend zu genau einer verifizierten CRM-Kundenkartei.
alter table swisscompact.clients
  add column if not exists portal_verified_at timestamptz,
  add column if not exists portal_verified_by uuid references auth.users(id) on delete set null;

alter table swisscompact.tenants
  add column if not exists client_id uuid references swisscompact.clients(id) on delete restrict;

create unique index if not exists tenants_client_unique
  on swisscompact.tenants(client_id)
  where client_id is not null;

alter table swisscompact.opportunities
  add column if not exists portal_request_id uuid references swisscompact.tenant_content(id) on delete set null;

create unique index if not exists opportunities_portal_request_unique
  on swisscompact.opportunities(portal_request_id)
  where portal_request_id is not null;

-- Bereits aktive Portale wurden von SwissCompact schon freigeschaltet. Sie werden
-- einmalig einer vorhandenen Kundenkartei zugeordnet oder als Bestandskunde angelegt.
do $$
declare
  tenant_record record;
  linked_client_id uuid;
  owner_email text;
begin
  for tenant_record in
    select id, name, client_id
    from swisscompact.tenants
    where status = 'active'
    order by created_at
  loop
    linked_client_id := tenant_record.client_id;

    select lower(u.email)
      into owner_email
    from swisscompact.tenant_memberships membership
    join auth.users u on u.id = membership.user_id
    where membership.tenant_id = tenant_record.id
      and membership.active
      and membership.role in ('owner', 'admin')
    order by case membership.role when 'owner' then 0 else 1 end, membership.created_at
    limit 1;

    if linked_client_id is null then
      select client.id
        into linked_client_id
      from swisscompact.clients client
      where not exists (
        select 1 from swisscompact.tenants linked_tenant where linked_tenant.client_id = client.id
      )
        and (
          lower(trim(client.company_name)) = lower(trim(tenant_record.name))
          or (owner_email is not null and lower(client.email) = owner_email)
        )
      order by
        case when lower(trim(client.company_name)) = lower(trim(tenant_record.name)) then 0 else 1 end,
        client.created_at
      limit 1;
    end if;

    if linked_client_id is null then
      insert into swisscompact.clients (company_name, contact_name, email, lifecycle, notes)
      values (
        tenant_record.name,
        null,
        owner_email,
        'customer',
        'Bestehender Portal-Kunde; bei Einführung der verbindlichen CRM-Verknüpfung übernommen.'
      )
      returning id into linked_client_id;
    end if;

    update swisscompact.clients
    set lifecycle = 'customer',
        portal_verified_at = coalesce(portal_verified_at, now()),
        updated_at = now()
    where id = linked_client_id;

    update swisscompact.tenants
    set client_id = linked_client_id,
        updated_at = now()
    where id = tenant_record.id;
  end loop;
end;
$$;

-- Bereits eingegangene Produktionsanfragen werden ebenfalls nachträglich in
-- den Auftragstrichter und damit in die zugehörige Kundenkartei übernommen.
insert into swisscompact.opportunities (
  client_id, title, stage, owner_area, value_chf, probability, expected_close,
  next_action, next_action_at, source, portal_request_id, created_by, created_at, updated_at
)
select
  tenant.client_id,
  left(content.title, 240),
  'request',
  'shared',
  0,
  20,
  case
    when coalesce(content.payload->>'desiredDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then (content.payload->>'desiredDate')::date
    else null
  end,
  'Produktionsanfrage prüfen, Umfang klären und Offerte vorbereiten',
  now() + interval '1 day',
  'customer-portal-production',
  content.id,
  content.created_by,
  content.created_at,
  now()
from swisscompact.tenant_content content
join swisscompact.tenants tenant on tenant.id = content.tenant_id
join swisscompact.clients client on client.id = tenant.client_id
where content.payload @> '{"serviceRequest":true}'::jsonb
  and client.lifecycle = 'customer'
  and client.portal_verified_at is not null
  and not exists (
    select 1 from swisscompact.opportunities opportunity where opportunity.portal_request_id = content.id
  );

update swisscompact.tenant_content content
set payload = content.payload || jsonb_build_object('opportunityId', opportunity.id),
    updated_at = now()
from swisscompact.opportunities opportunity
where opportunity.portal_request_id = content.id
  and content.payload @> '{"serviceRequest":true}'::jsonb;

alter table swisscompact.tenants
  drop constraint if exists tenants_active_client_required;
alter table swisscompact.tenants
  add constraint tenants_active_client_required
  check (status <> 'active' or client_id is not null) not valid;
alter table swisscompact.tenants validate constraint tenants_active_client_required;

create or replace function swisscompact.is_verified_portal_customer(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = swisscompact, public
as $$
  select exists (
    select 1
    from swisscompact.tenants tenant
    join swisscompact.clients client on client.id = tenant.client_id
    where tenant.id = target_tenant
      and tenant.status = 'active'
      and client.lifecycle = 'customer'
      and client.portal_verified_at is not null
  );
$$;

create or replace function swisscompact.is_tenant_member(target_tenant uuid)
returns boolean language sql stable security definer set search_path = swisscompact, public as $$
  select swisscompact.is_dashboard_admin() or (
    swisscompact.is_verified_portal_customer(target_tenant)
    and exists (
      select 1 from swisscompact.tenant_memberships
      where tenant_id = target_tenant and user_id = auth.uid() and active
    )
  );
$$;

create or replace function swisscompact.can_edit_tenant(target_tenant uuid)
returns boolean language sql stable security definer set search_path = swisscompact, public as $$
  select swisscompact.is_dashboard_admin() or (
    swisscompact.is_verified_portal_customer(target_tenant)
    and exists (
      select 1 from swisscompact.tenant_memberships
      where tenant_id = target_tenant and user_id = auth.uid() and active and role in ('owner','admin','editor')
    )
  );
$$;

create or replace function swisscompact.create_portal_service_request(
  target_tenant uuid,
  request_title text,
  request_payload jsonb
)
returns table(request_id uuid, opportunity_id uuid)
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  linked_client_id uuid;
  created_request_id uuid;
  created_opportunity_id uuid;
  desired_close date;
  safe_payload jsonb;
begin
  if auth.uid() is null or not exists (
    select 1
    from swisscompact.tenant_memberships membership
    where membership.tenant_id = target_tenant
      and membership.user_id = auth.uid()
      and membership.active
      and membership.role in ('owner', 'admin', 'editor')
  ) then
    raise exception 'Kein Bearbeitungszugriff auf dieses Kundenportal';
  end if;

  select tenant.client_id
    into linked_client_id
  from swisscompact.tenants tenant
  join swisscompact.clients client on client.id = tenant.client_id
  where tenant.id = target_tenant
    and tenant.status = 'active'
    and client.lifecycle = 'customer'
    and client.portal_verified_at is not null;

  if linked_client_id is null then
    raise exception 'Das Kundenportal ist keiner verifizierten Kundenkartei zugeordnet';
  end if;

  if nullif(trim(request_title), '') is null then
    raise exception 'Projekttitel fehlt';
  end if;

  safe_payload := coalesce(request_payload, '{}'::jsonb) || jsonb_build_object(
    'serviceRequest', true,
    'serviceRequestStatus', 'submitted'
  );

  if coalesce(safe_payload->>'desiredDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    desired_close := (safe_payload->>'desiredDate')::date;
  end if;

  insert into swisscompact.tenant_content (
    tenant_id, title, content_type, status, payload, created_by, updated_by
  )
  values (
    target_tenant, left(trim(request_title), 180), 'composition', 'review', safe_payload, auth.uid(), auth.uid()
  )
  returning id into created_request_id;

  insert into swisscompact.opportunities (
    client_id, title, stage, owner_area, value_chf, probability, expected_close,
    next_action, next_action_at, source, portal_request_id, created_by
  )
  values (
    linked_client_id,
    left(trim(request_title), 240),
    'request',
    'shared',
    0,
    20,
    desired_close,
    'Produktionsanfrage prüfen, Umfang klären und Offerte vorbereiten',
    now() + interval '1 day',
    'customer-portal-production',
    created_request_id,
    auth.uid()
  )
  returning id into created_opportunity_id;

  update swisscompact.tenant_content
  set payload = safe_payload || jsonb_build_object('opportunityId', created_opportunity_id),
      updated_at = now()
  where id = created_request_id;

  insert into swisscompact.tenant_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  values (
    target_tenant,
    auth.uid(),
    'create',
    'content_request',
    created_request_id,
    jsonb_build_object('opportunityId', created_opportunity_id, 'title', left(trim(request_title), 180))
  );

  return query select created_request_id, created_opportunity_id;
end;
$$;

revoke all on function swisscompact.is_verified_portal_customer(uuid),
  swisscompact.create_portal_service_request(uuid, text, jsonb) from public, anon;
grant execute on function swisscompact.is_verified_portal_customer(uuid),
  swisscompact.create_portal_service_request(uuid, text, jsonb) to authenticated, service_role;
