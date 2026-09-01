-- Nachvollziehbare Kampagnenstände mit sicherer Wiederherstellung als Entwurf.
begin;

create table if not exists swisscompact.tenant_campaign_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  campaign_id uuid not null references swisscompact.tenant_campaigns(id) on delete cascade,
  version integer not null check (version > 0),
  source text not null default 'saved'
    check (source in ('baseline','saved','restored')),
  configuration jsonb not null check (jsonb_typeof(configuration) = 'object'),
  restored_from_version_id uuid references swisscompact.tenant_campaign_versions(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (campaign_id, version)
);
create index if not exists tenant_campaign_versions_recent_idx
  on swisscompact.tenant_campaign_versions(tenant_id, campaign_id, version desc);

create or replace function swisscompact.build_campaign_snapshot(target_campaign uuid)
returns jsonb
language sql
stable
security definer
set search_path = swisscompact, public
as $$
  select jsonb_build_object(
    'name', campaign.name,
    'theme', campaign.theme,
    'status', campaign.status,
    'priority', campaign.priority,
    'startsAt', campaign.starts_at,
    'endsAt', campaign.ends_at,
    'schedule', coalesce(campaign.schedule, '{}'::jsonb),
    'scopeSiteId', campaign.scope_site_id,
    'scopeAreaId', campaign.scope_area_id,
    'displayIds', coalesce((
      select jsonb_agg(link.display_id order by link.display_id::text)
      from swisscompact.tenant_campaign_displays link
      where link.campaign_id = campaign.id
    ), '[]'::jsonb),
    'targetAssignments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'displayId', target.display_id,
          'contentItems', target.content_items
        ) order by target.display_id::text
      )
      from (
        select link.display_id, coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'contentId', assignment.content_id,
              'durationSeconds', assignment.duration_seconds
            ) order by assignment.position, assignment.content_id::text
          )
          from swisscompact.tenant_campaign_display_content assignment
          where assignment.campaign_id = campaign.id
            and assignment.display_id = link.display_id
        ), '[]'::jsonb) as content_items
        from swisscompact.tenant_campaign_displays link
        where link.campaign_id = campaign.id
      ) target
    ), '[]'::jsonb)
  )
  from swisscompact.tenant_campaigns campaign
  where campaign.id = target_campaign;
$$;

create or replace function swisscompact.capture_campaign_version(
  target_campaign uuid,
  version_source text default 'saved',
  restored_from uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  linked_tenant uuid;
  next_version integer;
  snapshot jsonb;
  existing_version uuid;
  existing_snapshot jsonb;
  created_version uuid;
begin
  select tenant_id into linked_tenant
  from swisscompact.tenant_campaigns
  where id = target_campaign
  for update;

  if linked_tenant is null then raise exception 'Kampagne nicht gefunden'; end if;
  if auth.role() <> 'service_role' and not swisscompact.can_edit_tenant(linked_tenant) then
    raise exception 'Kein Bearbeitungszugriff auf diese Kampagne';
  end if;
  if version_source not in ('saved','restored') then
    raise exception 'Ungültige Versionsquelle';
  end if;
  if restored_from is not null and not exists (
    select 1 from swisscompact.tenant_campaign_versions version
    where version.id = restored_from
      and version.campaign_id = target_campaign
      and version.tenant_id = linked_tenant
  ) then
    raise exception 'Die Ursprungsversion gehört nicht zu dieser Kampagne';
  end if;

  snapshot := swisscompact.build_campaign_snapshot(target_campaign);
  if snapshot is null then raise exception 'Kampagnenstand konnte nicht erstellt werden'; end if;

  if version_source = 'saved' then
    select id, configuration into existing_version, existing_snapshot
    from swisscompact.tenant_campaign_versions
    where campaign_id = target_campaign
    order by version desc
    limit 1;
    if existing_version is not null and existing_snapshot = snapshot then return existing_version; end if;
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from swisscompact.tenant_campaign_versions
  where campaign_id = target_campaign;

  insert into swisscompact.tenant_campaign_versions (
    tenant_id, campaign_id, version, source, configuration,
    restored_from_version_id, created_by
  ) values (
    linked_tenant, target_campaign, next_version, version_source, snapshot,
    restored_from, auth.uid()
  ) returning id into created_version;

  return created_version;
end;
$$;

create or replace function swisscompact.restore_campaign_version(target_version uuid)
returns uuid
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  saved_version swisscompact.tenant_campaign_versions%rowtype;
  campaign_record swisscompact.tenant_campaigns%rowtype;
  snapshot jsonb;
  raw_display text;
  assignment jsonb;
  content_item jsonb;
  selected_display uuid;
  selected_content uuid;
  entry_position integer;
  restored_version uuid;
begin
  select * into saved_version
  from swisscompact.tenant_campaign_versions
  where id = target_version;
  if saved_version.id is null then raise exception 'Kampagnenversion nicht gefunden'; end if;

  select * into campaign_record
  from swisscompact.tenant_campaigns
  where id = saved_version.campaign_id and tenant_id = saved_version.tenant_id
  for update;
  if campaign_record.id is null then raise exception 'Kampagne nicht gefunden'; end if;
  if auth.role() <> 'service_role' and not swisscompact.can_edit_tenant(saved_version.tenant_id) then
    raise exception 'Kein Bearbeitungszugriff auf diese Kampagne';
  end if;
  if campaign_record.status in ('active','scheduled') then
    raise exception 'Pausieren Sie die laufende Kampagne vor der Wiederherstellung';
  end if;

  snapshot := saved_version.configuration;
  if jsonb_typeof(snapshot->'displayIds') is distinct from 'array'
    or jsonb_typeof(snapshot->'targetAssignments') is distinct from 'array'
    or nullif(trim(snapshot->>'name'), '') is null then
    raise exception 'Der gespeicherte Kampagnenstand ist unvollständig';
  end if;

  for raw_display in select value from jsonb_array_elements_text(snapshot->'displayIds')
  loop
    selected_display := raw_display::uuid;
    if not exists (
      select 1 from swisscompact.tenant_displays display
      where display.id = selected_display and display.tenant_id = saved_version.tenant_id
    ) then
      raise exception 'Ein gespeicherter Bildschirm ist nicht mehr verfügbar';
    end if;
  end loop;

  for assignment in select value from jsonb_array_elements(snapshot->'targetAssignments')
  loop
    selected_display := nullif(assignment->>'displayId', '')::uuid;
    if selected_display is null or not (snapshot->'displayIds' ? selected_display::text) then
      raise exception 'Eine gespeicherte Playlist hat keinen gültigen Bildschirm';
    end if;
    if jsonb_typeof(assignment->'contentItems') is distinct from 'array' then
      raise exception 'Eine gespeicherte Playlist ist ungültig';
    end if;
    for content_item in select value from jsonb_array_elements(assignment->'contentItems')
    loop
      selected_content := nullif(content_item->>'contentId', '')::uuid;
      if selected_content is null or not exists (
        select 1 from swisscompact.tenant_content content
        where content.id = selected_content
          and content.tenant_id = saved_version.tenant_id
          and content.status <> 'archived'
      ) then
        raise exception 'Ein gespeicherter Inhalt ist nicht mehr verfügbar';
      end if;
    end loop;
  end loop;

  if jsonb_typeof(snapshot->'schedule'->'portalHierarchyPlaylists') = 'object' then
    for content_item in
      select playlist_item.value
      from jsonb_each(snapshot->'schedule'->'portalHierarchyPlaylists') hierarchy_level
      cross join lateral jsonb_array_elements(hierarchy_level.value) playlist_item(value)
    loop
      selected_content := nullif(content_item->>'contentId', '')::uuid;
      if selected_content is null or not exists (
        select 1 from swisscompact.tenant_content content
        where content.id = selected_content
          and content.tenant_id = saved_version.tenant_id
          and content.status <> 'archived'
      ) then
        raise exception 'Ein hierarchischer Inhalt ist nicht mehr verfügbar';
      end if;
    end loop;
  end if;

  update swisscompact.tenant_campaigns
  set name = trim(snapshot->>'name'),
      theme = nullif(trim(snapshot->>'theme'), ''),
      status = 'draft',
      priority = greatest(0, least(100, coalesce((snapshot->>'priority')::integer, 50))),
      starts_at = nullif(snapshot->>'startsAt', '')::timestamptz,
      ends_at = nullif(snapshot->>'endsAt', '')::timestamptz,
      schedule = coalesce(snapshot->'schedule', '{}'::jsonb),
      scope_site_id = nullif(snapshot->>'scopeSiteId', '')::uuid,
      scope_area_id = nullif(snapshot->>'scopeAreaId', '')::uuid,
      updated_at = now()
  where id = campaign_record.id and tenant_id = saved_version.tenant_id;

  delete from swisscompact.tenant_campaign_display_content
  where campaign_id = campaign_record.id and tenant_id = saved_version.tenant_id;
  delete from swisscompact.tenant_campaign_content where campaign_id = campaign_record.id;
  delete from swisscompact.tenant_campaign_displays where campaign_id = campaign_record.id;

  for raw_display in select value from jsonb_array_elements_text(snapshot->'displayIds')
  loop
    insert into swisscompact.tenant_campaign_displays (campaign_id, display_id)
    values (campaign_record.id, raw_display::uuid);
  end loop;

  for assignment in select value from jsonb_array_elements(snapshot->'targetAssignments')
  loop
    selected_display := (assignment->>'displayId')::uuid;
    entry_position := 0;
    for content_item in select value from jsonb_array_elements(assignment->'contentItems')
    loop
      selected_content := (content_item->>'contentId')::uuid;
      insert into swisscompact.tenant_campaign_display_content (
        tenant_id, campaign_id, display_id, content_id, position, duration_seconds
      ) values (
        saved_version.tenant_id, campaign_record.id, selected_display, selected_content,
        entry_position,
        greatest(5, least(3600, coalesce((content_item->>'durationSeconds')::integer, 10)))
      );
      insert into swisscompact.tenant_campaign_content (
        campaign_id, content_id, position, duration_seconds
      ) values (
        campaign_record.id, selected_content, entry_position,
        greatest(5, least(3600, coalesce((content_item->>'durationSeconds')::integer, 10)))
      ) on conflict (campaign_id, content_id) do nothing;
      entry_position := entry_position + 1;
    end loop;
  end loop;

  restored_version := swisscompact.capture_campaign_version(
    campaign_record.id, 'restored', saved_version.id
  );
  return restored_version;
end;
$$;

-- Bestehende Kampagnen erhalten sofort eine lesbare Ausgangsversion.
insert into swisscompact.tenant_campaign_versions (
  tenant_id, campaign_id, version, source, configuration, created_by, created_at
)
select campaign.tenant_id, campaign.id, 1, 'baseline',
  swisscompact.build_campaign_snapshot(campaign.id), campaign.created_by, campaign.updated_at
from swisscompact.tenant_campaigns campaign
where not exists (
  select 1 from swisscompact.tenant_campaign_versions version
  where version.campaign_id = campaign.id
);

alter table swisscompact.tenant_campaign_versions enable row level security;

drop policy if exists tenant_campaign_versions_read on swisscompact.tenant_campaign_versions;
create policy tenant_campaign_versions_read on swisscompact.tenant_campaign_versions for select
using (swisscompact.is_tenant_member(tenant_id));

revoke all on function swisscompact.build_campaign_snapshot(uuid),
  swisscompact.capture_campaign_version(uuid,text,uuid),
  swisscompact.restore_campaign_version(uuid) from public, anon;
revoke all on function swisscompact.build_campaign_snapshot(uuid) from authenticated;
grant execute on function swisscompact.capture_campaign_version(uuid,text,uuid),
  swisscompact.restore_campaign_version(uuid) to authenticated, service_role;
grant select on swisscompact.tenant_campaign_versions to authenticated, service_role;
grant insert, update, delete on swisscompact.tenant_campaign_versions to service_role;

commit;
