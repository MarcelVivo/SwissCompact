-- Paketabhängiger Support mit transparenten Erstreaktionszielen.
begin;

create table if not exists swisscompact.support_sla_policies (
  package_code text primary key references swisscompact.subscription_packages(code) on delete cascade,
  support_label text not null check (char_length(trim(support_label)) between 1 and 120),
  coverage_description text not null check (char_length(trim(coverage_description)) between 1 and 500),
  critical_coverage text not null default 'business_hours'
    check (critical_coverage in ('business_hours','24x7')),
  business_timezone text not null default 'Europe/Zurich',
  business_start time not null default '08:00',
  business_end time not null default '17:00',
  critical_response_minutes integer not null check (critical_response_minutes between 15 and 10080),
  high_response_minutes integer not null check (high_response_minutes between 15 and 10080),
  normal_response_minutes integer not null check (normal_response_minutes between 15 and 20160),
  low_response_minutes integer not null check (low_response_minutes between 15 and 40320),
  response_target_note text not null default 'Ziel bis zur ersten persönlichen Reaktion, keine garantierte Lösungszeit.',
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (business_end > business_start),
  check (
    critical_response_minutes <= high_response_minutes
    and high_response_minutes <= normal_response_minutes
    and normal_response_minutes <= low_response_minutes
  )
);

insert into swisscompact.support_sla_policies (
  package_code, support_label, coverage_description, critical_coverage,
  critical_response_minutes, high_response_minutes, normal_response_minutes, low_response_minutes
) values
  ('essential', 'Standard-Support', 'Montag bis Freitag, 08:00–17:00 Uhr (Europe/Zurich).', 'business_hours', 480, 540, 1080, 1620),
  ('business', 'Priorisierter Support', 'Montag bis Freitag, 08:00–17:00 Uhr (Europe/Zurich).', 'business_hours', 240, 480, 540, 1080),
  ('enterprise', 'Enterprise SLA', 'Kritische Totalausfälle werden rund um die Uhr angenommen; alle übrigen Fälle Montag bis Freitag, 08:00–17:00 Uhr.', '24x7', 60, 240, 480, 540)
on conflict (package_code) do nothing;

create sequence if not exists swisscompact.support_ticket_number_seq start 1;

create table if not exists swisscompact.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default (
    'SUP-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('swisscompact.support_ticket_number_seq')::text, 6, '0')
  ),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  subscription_id uuid references swisscompact.tenant_subscriptions(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  affected_display_id uuid references swisscompact.tenant_displays(id) on delete set null,
  category text not null check (category in ('incident','question','billing','training','feature','content')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  status text not null default 'new'
    check (status in ('new','in_progress','waiting_customer','resolved','closed','cancelled')),
  title text not null check (char_length(trim(title)) between 3 and 180),
  description text not null check (char_length(trim(description)) between 10 and 8000),
  package_code_snapshot text not null,
  support_label_snapshot text not null,
  coverage_snapshot text not null,
  response_target_minutes integer not null check (response_target_minutes > 0),
  first_response_due_at timestamptz not null,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('resolved','closed') or resolved_at is not null),
  check (status <> 'closed' or closed_at is not null)
);
create index if not exists support_tickets_tenant_recent_idx
  on swisscompact.support_tickets(tenant_id, created_at desc);
create index if not exists support_tickets_queue_idx
  on swisscompact.support_tickets(status, priority, first_response_due_at)
  where status not in ('resolved','closed','cancelled');

create table if not exists swisscompact.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references swisscompact.support_tickets(id) on delete cascade,
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  author_type text not null check (author_type in ('customer','support','system')),
  author_name text not null check (char_length(trim(author_name)) between 1 and 180),
  body text not null check (char_length(trim(body)) between 1 and 8000),
  visible_to_customer boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists support_ticket_messages_ticket_idx
  on swisscompact.support_ticket_messages(ticket_id, created_at);

create or replace function swisscompact.calculate_support_due_at(
  base_time timestamptz,
  target_minutes integer,
  target_timezone text,
  day_start time,
  day_end time,
  coverage_mode text
)
returns timestamptz
language plpgsql
stable
set search_path = swisscompact, public
as $$
declare
  cursor_local timestamp := base_time at time zone target_timezone;
  remaining integer := target_minutes;
  available integer;
begin
  if coverage_mode = '24x7' then return base_time + make_interval(mins => target_minutes); end if;
  loop
    while extract(isodow from cursor_local) in (6,7) loop
      cursor_local := (cursor_local::date + 1) + day_start;
    end loop;
    if cursor_local::time < day_start then
      cursor_local := cursor_local::date + day_start;
    elsif cursor_local::time >= day_end then
      cursor_local := (cursor_local::date + 1) + day_start;
      continue;
    end if;
    available := floor(extract(epoch from (((cursor_local::date + day_end) - cursor_local))) / 60);
    if remaining <= available then
      return (cursor_local + make_interval(mins => remaining)) at time zone target_timezone;
    end if;
    remaining := remaining - available;
    cursor_local := (cursor_local::date + 1) + day_start;
  end loop;
end;
$$;

create or replace function swisscompact.create_support_ticket(
  target_tenant uuid,
  target_category text,
  target_priority text,
  target_title text,
  target_description text,
  target_display uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  membership swisscompact.tenant_memberships%rowtype;
  subscription swisscompact.tenant_subscriptions%rowtype;
  policy swisscompact.support_sla_policies%rowtype;
  response_minutes integer;
  coverage_mode text;
  created_ticket uuid;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
  select * into membership from swisscompact.tenant_memberships
  where tenant_id = target_tenant and user_id = auth.uid() and active
    and access_status = 'active' and verified_at is not null limit 1;
  if membership.id is null then raise exception 'Kein bestätigter Portalzugriff'; end if;
  if target_category not in ('incident','question','billing','training','feature','content')
    or target_priority not in ('low','normal','high','critical') then
    raise exception 'Ungültige Supportkategorie oder Priorität';
  end if;
  if char_length(trim(target_title)) not between 3 and 180
    or char_length(trim(target_description)) not between 10 and 8000 then
    raise exception 'Titel oder Beschreibung ist unvollständig';
  end if;
  if target_display is not null and not exists (
    select 1 from swisscompact.tenant_displays where id = target_display and tenant_id = target_tenant
  ) then raise exception 'Der Bildschirm gehört nicht zu diesem Kundenportal'; end if;

  select * into subscription from swisscompact.tenant_subscriptions
  where tenant_id = target_tenant and status in ('trial','active','past_due','paused')
  order by updated_at desc limit 1;
  if subscription.id is null then raise exception 'Kein aktives Supportpaket gefunden'; end if;
  select * into policy from swisscompact.support_sla_policies
  where package_code = subscription.package_code and active;
  if policy.package_code is null then raise exception 'Für dieses Paket ist noch kein Supportmodell hinterlegt'; end if;

  response_minutes := case target_priority
    when 'critical' then policy.critical_response_minutes
    when 'high' then policy.high_response_minutes
    when 'normal' then policy.normal_response_minutes
    else policy.low_response_minutes end;
  coverage_mode := case when target_priority = 'critical' then policy.critical_coverage else 'business_hours' end;

  insert into swisscompact.support_tickets (
    tenant_id, subscription_id, requested_by, affected_display_id, category, priority,
    title, description, package_code_snapshot, support_label_snapshot, coverage_snapshot,
    response_target_minutes, first_response_due_at
  ) values (
    target_tenant, subscription.id, auth.uid(), target_display, target_category, target_priority,
    trim(target_title), trim(target_description), subscription.package_code, policy.support_label,
    policy.coverage_description, response_minutes,
    swisscompact.calculate_support_due_at(now(), response_minutes, policy.business_timezone,
      policy.business_start, policy.business_end, coverage_mode)
  ) returning id into created_ticket;

  insert into swisscompact.tenant_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant, auth.uid(), 'support_ticket_created', 'support_ticket', created_ticket,
    jsonb_build_object('category', target_category, 'priority', target_priority,
      'packageCode', subscription.package_code, 'responseTargetMinutes', response_minutes)
  );
  return created_ticket;
end;
$$;

create or replace function swisscompact.add_customer_support_message(
  target_ticket uuid,
  message_body text
)
returns uuid
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  ticket swisscompact.support_tickets%rowtype;
  membership swisscompact.tenant_memberships%rowtype;
  created_message uuid;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
  select * into ticket from swisscompact.support_tickets where id = target_ticket;
  if ticket.id is null then raise exception 'Kein Zugriff auf diese Supportanfrage'; end if;
  select * into membership from swisscompact.tenant_memberships
  where tenant_id = ticket.tenant_id and user_id = auth.uid() and active
    and access_status = 'active' and verified_at is not null limit 1;
  if membership.id is null then raise exception 'Kein Zugriff auf diese Supportanfrage'; end if;
  if ticket.status in ('closed','cancelled') then
    raise exception 'Diese Supportanfrage kann nicht beantwortet werden';
  end if;
  if char_length(trim(message_body)) not between 1 and 8000 then raise exception 'Nachricht ist leer oder zu lang'; end if;

  insert into swisscompact.support_ticket_messages (
    ticket_id, tenant_id, author_user_id, author_type, author_name, body
  ) values (
    ticket.id, ticket.tenant_id, auth.uid(), 'customer',
    coalesce(nullif(trim(membership.display_name), ''), 'Portalbenutzer'), trim(message_body)
  ) returning id into created_message;
  update swisscompact.support_tickets
  set status = case when status in ('waiting_customer','resolved') then 'in_progress' else status end,
      resolved_at = case when status = 'resolved' then null else resolved_at end,
      updated_at = now()
  where id = ticket.id;
  return created_message;
end;
$$;

alter table swisscompact.support_sla_policies enable row level security;
alter table swisscompact.support_tickets enable row level security;
alter table swisscompact.support_ticket_messages enable row level security;

drop policy if exists support_sla_policies_read on swisscompact.support_sla_policies;
create policy support_sla_policies_read on swisscompact.support_sla_policies for select
using (auth.uid() is not null);
drop policy if exists support_tickets_read on swisscompact.support_tickets;
create policy support_tickets_read on swisscompact.support_tickets for select
using (swisscompact.is_dashboard_admin() or swisscompact.is_tenant_member(tenant_id));
drop policy if exists support_ticket_messages_read on swisscompact.support_ticket_messages;
create policy support_ticket_messages_read on swisscompact.support_ticket_messages for select
using (
  swisscompact.is_dashboard_admin()
  or (visible_to_customer and swisscompact.is_tenant_member(tenant_id))
);

revoke all on function swisscompact.calculate_support_due_at(timestamptz,integer,text,time,time,text),
  swisscompact.create_support_ticket(uuid,text,text,text,text,uuid),
  swisscompact.add_customer_support_message(uuid,text) from public, anon;
grant execute on function swisscompact.create_support_ticket(uuid,text,text,text,text,uuid),
  swisscompact.add_customer_support_message(uuid,text) to authenticated, service_role;
grant execute on function swisscompact.calculate_support_due_at(timestamptz,integer,text,time,time,text)
  to service_role;
grant select on swisscompact.support_sla_policies, swisscompact.support_tickets,
  swisscompact.support_ticket_messages to authenticated, service_role;
grant insert, update, delete on swisscompact.support_sla_policies, swisscompact.support_tickets,
  swisscompact.support_ticket_messages to service_role;

commit;
