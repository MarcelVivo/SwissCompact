-- Ein Kundenportal gehört zwingend zu genau einer verifizierten CRM-Kundenkartei.
-- Vor dem Ausführen zuerst die Bestandsprüfung in docs/portal-rollout-checklist.md durchführen.
alter table swisscompact.clients
  add column if not exists portal_verified_at timestamptz,
  add column if not exists portal_verified_by uuid references auth.users(id) on delete set null;

alter table swisscompact.tenants
  add column if not exists client_id uuid references swisscompact.clients(id) on delete restrict;

alter table swisscompact.tenant_memberships
  add column if not exists access_status text not null default 'invited'
    check (access_status in ('invited','active','suspended','revoked')),
  add column if not exists invited_at timestamptz not null default now(),
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists revoked_at timestamptz;

-- Bestehende Mitgliedschaften sind nur dann weiter aktiv, wenn Supabase die
-- persönliche E-Mail-Adresse bereits bestätigt hat. Unbestätigte Konten bleiben
-- als Einladung sichtbar, erhalten aber keinen Portalzugriff.
update swisscompact.tenant_memberships membership
set access_status = case
      when membership.active and portal_user.email_confirmed_at is not null then 'active'
      when membership.active then 'invited'
      else 'suspended'
    end,
    active = membership.active and portal_user.email_confirmed_at is not null,
    accepted_at = case
      when membership.active and portal_user.email_confirmed_at is not null
        then coalesce(membership.accepted_at, portal_user.email_confirmed_at, membership.created_at)
      else membership.accepted_at
    end,
    verified_at = case
      when membership.active and portal_user.email_confirmed_at is not null
        then coalesce(membership.verified_at, portal_user.email_confirmed_at)
      else null
    end
from auth.users portal_user
where portal_user.id = membership.user_id
  and membership.accepted_at is null
  and membership.verified_at is null;

create or replace function swisscompact.validate_portal_membership_access()
returns trigger
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  confirmed_at timestamptz;
begin
  select portal_user.email_confirmed_at
    into confirmed_at
  from auth.users portal_user
  where portal_user.id = new.user_id;

  if new.access_status = 'active' then
    if confirmed_at is null then
      raise exception 'Portalbenutzer muss zuerst seine E-Mail-Adresse bestätigen';
    end if;
    new.active := true;
    new.accepted_at := coalesce(new.accepted_at, confirmed_at, now());
    new.verified_at := coalesce(new.verified_at, confirmed_at, now());
    new.revoked_at := null;
  else
    new.active := false;
    if new.access_status = 'revoked' then
      new.revoked_at := coalesce(new.revoked_at, now());
    else
      new.revoked_at := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tenant_memberships_validate_access on swisscompact.tenant_memberships;
create trigger tenant_memberships_validate_access
before insert or update of user_id, active, access_status
on swisscompact.tenant_memberships
for each row execute function swisscompact.validate_portal_membership_access();

alter table swisscompact.tenant_memberships
  drop constraint if exists tenant_memberships_active_status_consistent;
alter table swisscompact.tenant_memberships
  add constraint tenant_memberships_active_status_consistent
  check (active = (access_status = 'active')) not valid;
alter table swisscompact.tenant_memberships
  validate constraint tenant_memberships_active_status_consistent;

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
  candidate_client_ids uuid[];
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

    if owner_email is null then
      raise exception using
        message = format('Aktives Portal "%s" hat keine aktive Inhaber- oder Admin-Mitgliedschaft', tenant_record.name),
        hint = 'Bestandsprüfung aus docs/portal-rollout-checklist.md ausführen und Mitgliedschaft korrigieren.';
    end if;

    if linked_client_id is null then
      select array_agg(client.id order by
          case when lower(trim(client.company_name)) = lower(trim(tenant_record.name)) then 0 else 1 end,
          client.created_at)
        into candidate_client_ids
      from swisscompact.clients client
      where not exists (
        select 1 from swisscompact.tenants linked_tenant where linked_tenant.client_id = client.id
      )
        and (
          lower(trim(client.company_name)) = lower(trim(tenant_record.name))
          or (owner_email is not null and lower(client.email) = owner_email)
        );

      if coalesce(cardinality(candidate_client_ids), 0) > 1 then
        raise exception using
          message = format('Portal "%s" passt zu mehreren Kundenkarteien', tenant_record.name),
          hint = 'Vor der Migration tenant.client_id eindeutig setzen oder doppelte Kundenkarteien bereinigen.';
      end if;

      linked_client_id := candidate_client_ids[1];
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

create or replace function swisscompact.is_verified_portal_user(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = swisscompact, public
as $$
  select exists (
    select 1
    from swisscompact.tenant_memberships membership
    join auth.users portal_user on portal_user.id = membership.user_id
    where membership.tenant_id = target_tenant
      and membership.user_id = auth.uid()
      and membership.active
      and membership.access_status = 'active'
      and membership.verified_at is not null
      and portal_user.email_confirmed_at is not null
  );
$$;

create or replace function swisscompact.is_tenant_member(target_tenant uuid)
returns boolean language sql stable security definer set search_path = swisscompact, public as $$
  select swisscompact.is_dashboard_admin() or (
    swisscompact.is_verified_portal_customer(target_tenant)
    and swisscompact.is_verified_portal_user(target_tenant)
  );
$$;

create or replace function swisscompact.can_edit_tenant(target_tenant uuid)
returns boolean language sql stable security definer set search_path = swisscompact, public as $$
  select swisscompact.is_dashboard_admin() or (
    swisscompact.is_verified_portal_customer(target_tenant)
    and swisscompact.is_verified_portal_user(target_tenant)
    and exists (
      select 1 from swisscompact.tenant_memberships
      where tenant_id = target_tenant
        and user_id = auth.uid()
        and active
        and access_status = 'active'
        and role in ('owner','admin','editor')
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
  if auth.uid() is null
    or not swisscompact.is_verified_portal_customer(target_tenant)
    or not swisscompact.is_verified_portal_user(target_tenant)
    or not exists (
    select 1
    from swisscompact.tenant_memberships membership
    where membership.tenant_id = target_tenant
      and membership.user_id = auth.uid()
      and membership.active
      and membership.access_status = 'active'
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

-- Die Migration bricht vollständig ab, statt einen teilweise zugänglichen
-- oder falsch zugeordneten Kundenbestand zu hinterlassen.
do $$
begin
  if exists (
    select 1
    from swisscompact.tenants tenant
    left join swisscompact.clients client on client.id = tenant.client_id
    where tenant.status = 'active'
      and (
        client.id is null
        or client.lifecycle <> 'customer'
        or client.portal_verified_at is null
      )
  ) then
    raise exception 'Mindestens ein aktives Portal ist keiner verifizierten Kundenkartei zugeordnet';
  end if;

  if exists (
    select 1
    from swisscompact.tenants tenant
    where tenant.status = 'active'
      and not exists (
        select 1
        from swisscompact.tenant_memberships membership
        join auth.users portal_user on portal_user.id = membership.user_id
        where membership.tenant_id = tenant.id
          and membership.role in ('owner','admin')
          and membership.active
          and membership.access_status = 'active'
          and membership.verified_at is not null
          and portal_user.email_confirmed_at is not null
      )
  ) then
    raise exception 'Mindestens ein aktives Portal hat keinen bestätigten Inhaber oder Administrator';
  end if;

  if exists (
    select 1
    from swisscompact.tenant_content content
    join swisscompact.tenants tenant on tenant.id = content.tenant_id
    left join swisscompact.opportunities opportunity
      on opportunity.portal_request_id = content.id
      and opportunity.client_id = tenant.client_id
    where content.payload @> '{"serviceRequest":true}'::jsonb
      and opportunity.id is null
  ) then
    raise exception 'Mindestens eine Produktionsanfrage ist nicht korrekt mit dem Auftragstrichter verknüpft';
  end if;
end;
$$;

revoke all on function swisscompact.validate_portal_membership_access(),
  swisscompact.is_verified_portal_customer(uuid),
  swisscompact.is_verified_portal_user(uuid),
  swisscompact.create_portal_service_request(uuid, text, jsonb) from public, anon;
grant execute on function swisscompact.is_verified_portal_customer(uuid),
  swisscompact.is_verified_portal_user(uuid),
  swisscompact.create_portal_service_request(uuid, text, jsonb) to authenticated, service_role;
