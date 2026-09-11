-- Deduplizierte externe Alarmweiterleitung für kritische Betriebsmeldungen.
begin;

alter table swisscompact.operational_incidents
  add column if not exists external_alert_last_attempted_at timestamptz,
  add column if not exists external_alert_delivered_at timestamptz,
  add column if not exists external_alert_status text
    check (external_alert_status is null or external_alert_status in ('pending','delivered','partial','failed','not_configured')),
  add column if not exists external_alert_error text
    check (external_alert_error is null or char_length(external_alert_error) <= 2000);

create or replace function swisscompact.claim_operational_incident_alert(
  target_incident uuid,
  target_cooldown_minutes integer default 15
)
returns boolean
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare affected_rows integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Alarmweiterleitungen dürfen nur serverseitig ausgelöst werden';
  end if;
  if target_cooldown_minutes not between 1 and 1440 then
    raise exception 'Ungültige Alarm-Sperrzeit';
  end if;

  update swisscompact.operational_incidents
  set external_alert_last_attempted_at = now(),
      external_alert_status = 'pending',
      external_alert_error = null,
      updated_at = now()
  where id = target_incident
    and severity = 'critical'
    and status = 'open'
    and (
      external_alert_last_attempted_at is null
      or external_alert_last_attempted_at <= now() - make_interval(mins => target_cooldown_minutes)
    );
  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

revoke all on function swisscompact.claim_operational_incident_alert(uuid,integer)
  from public, anon, authenticated;
grant execute on function swisscompact.claim_operational_incident_alert(uuid,integer)
  to service_role;

commit;
