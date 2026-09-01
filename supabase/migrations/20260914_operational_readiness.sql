-- Betriebsmonitoring, Zustellnachweise und kontrollierte Wiederherstellungstests.
begin;

create table if not exists swisscompact.operational_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_key text not null unique check (char_length(incident_key) between 1 and 240),
  tenant_id uuid references swisscompact.tenants(id) on delete cascade,
  source text not null check (source in ('application','auth','email','mux','stripe','storage','database','display','backup')),
  kind text not null check (char_length(kind) between 1 and 120),
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  title text not null check (char_length(title) between 1 and 240),
  message text not null default '' check (char_length(message) <= 4000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists operational_incidents_open_idx
  on swisscompact.operational_incidents(status, severity, last_seen_at desc);

create table if not exists swisscompact.operational_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references swisscompact.tenants(id) on delete cascade,
  channel text not null check (channel in ('email','webhook','export','media')),
  event_type text not null check (char_length(event_type) between 1 and 120),
  entity_type text,
  entity_id text,
  recipient_hint text check (recipient_hint is null or char_length(recipient_hint) <= 180),
  provider_reference text,
  status text not null check (status in ('pending','delivered','failed','cancelled')),
  attempt_number integer not null default 1 check (attempt_number between 1 and 100),
  error_message text check (error_message is null or char_length(error_message) <= 2000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  attempted_at timestamptz not null default now(),
  next_retry_at timestamptz,
  completed_at timestamptz
);
create index if not exists operational_delivery_attempts_status_idx
  on swisscompact.operational_delivery_attempts(status, attempted_at desc);
create index if not exists operational_delivery_attempts_tenant_idx
  on swisscompact.operational_delivery_attempts(tenant_id, attempted_at desc);

create table if not exists swisscompact.operational_recovery_drills (
  id uuid primary key default gen_random_uuid(),
  drill_type text not null check (drill_type in ('database_restore','storage_restore','full_recovery')),
  environment text not null default 'staging' check (environment in ('local','staging','isolated_project')),
  status text not null default 'scheduled' check (status in ('scheduled','running','passed','failed','cancelled')),
  title text not null check (char_length(trim(title)) between 1 and 240),
  backup_reference text check (backup_reference is null or char_length(backup_reference) <= 500),
  recovery_point_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  recovery_time_minutes integer check (recovery_time_minutes is null or recovery_time_minutes between 0 and 100000),
  verified_checks jsonb not null default '[]'::jsonb check (jsonb_typeof(verified_checks) = 'array'),
  notes text check (notes is null or char_length(notes) <= 8000),
  evidence_url text check (evidence_url is null or char_length(evidence_url) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('passed','failed') or completed_at is not null)
);
create index if not exists operational_recovery_drills_recent_idx
  on swisscompact.operational_recovery_drills(created_at desc);

create or replace function swisscompact.report_operational_incident(
  target_key text,
  target_tenant uuid,
  target_source text,
  target_kind text,
  target_severity text,
  target_title text,
  target_message text default '',
  target_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare incident_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Betriebsmeldungen dürfen nur serverseitig erfasst werden';
  end if;
  insert into swisscompact.operational_incidents (
    incident_key, tenant_id, source, kind, severity, title, message, metadata
  ) values (
    left(trim(target_key), 240), target_tenant, target_source, left(trim(target_kind), 120),
    target_severity, left(trim(target_title), 240), left(coalesce(target_message, ''), 4000),
    coalesce(target_metadata, '{}'::jsonb)
  )
  on conflict (incident_key) do update
  set tenant_id = excluded.tenant_id,
      source = excluded.source,
      kind = excluded.kind,
      severity = excluded.severity,
      status = 'open',
      title = excluded.title,
      message = excluded.message,
      metadata = excluded.metadata,
      occurrence_count = operational_incidents.occurrence_count + 1,
      last_seen_at = now(),
      acknowledged_by = null,
      acknowledged_at = null,
      resolved_by = null,
      resolved_at = null,
      updated_at = now()
  returning id into incident_id;
  return incident_id;
end;
$$;

alter table swisscompact.operational_incidents enable row level security;
alter table swisscompact.operational_delivery_attempts enable row level security;
alter table swisscompact.operational_recovery_drills enable row level security;

drop policy if exists operational_incidents_admin_read on swisscompact.operational_incidents;
create policy operational_incidents_admin_read on swisscompact.operational_incidents for select
using (swisscompact.is_dashboard_admin());
drop policy if exists operational_deliveries_admin_read on swisscompact.operational_delivery_attempts;
create policy operational_deliveries_admin_read on swisscompact.operational_delivery_attempts for select
using (swisscompact.is_dashboard_admin());
drop policy if exists operational_drills_admin_read on swisscompact.operational_recovery_drills;
create policy operational_drills_admin_read on swisscompact.operational_recovery_drills for select
using (swisscompact.is_dashboard_admin());

revoke all on function swisscompact.report_operational_incident(text,uuid,text,text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function swisscompact.report_operational_incident(text,uuid,text,text,text,text,text,jsonb)
  to service_role;
grant select on swisscompact.operational_incidents,
  swisscompact.operational_delivery_attempts,
  swisscompact.operational_recovery_drills to authenticated, service_role;
grant insert, update, delete on swisscompact.operational_incidents,
  swisscompact.operational_delivery_attempts,
  swisscompact.operational_recovery_drills to service_role;

commit;
