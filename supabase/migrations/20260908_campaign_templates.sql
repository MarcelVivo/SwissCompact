-- Wiederverwendbare Kampagnenvorlagen für den geführten Portal-Schnellstart.
begin;

create table if not exists swisscompact.tenant_campaign_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 180),
  description text,
  template_kind text not null default 'custom'
    check (template_kind in ('custom','weekly_offer','promotion','information','partner')),
  configuration jsonb not null default '{}'::jsonb,
  source_campaign_id uuid references swisscompact.tenant_campaigns(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tenant_campaign_templates_name_unique
  on swisscompact.tenant_campaign_templates(tenant_id, lower(trim(name)));
create index if not exists tenant_campaign_templates_recent_idx
  on swisscompact.tenant_campaign_templates(tenant_id, updated_at desc);

create or replace function swisscompact.validate_campaign_template_scope()
returns trigger
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  linked_id uuid;
  assignment jsonb;
  content_item jsonb;
begin
  if jsonb_typeof(new.configuration) <> 'object' then
    raise exception 'Die Vorlagenkonfiguration muss ein Objekt sein';
  end if;
  if new.source_campaign_id is not null and not exists (
    select 1
    from swisscompact.tenant_campaigns campaign
    where campaign.id = new.source_campaign_id
      and campaign.tenant_id = new.tenant_id
  ) then
    raise exception 'Die Ursprungskampagne gehört nicht zu diesem Kundenportal';
  end if;

  if new.configuration ? 'displayIds' then
    if jsonb_typeof(new.configuration->'displayIds') <> 'array' then
      raise exception 'Die Bildschirmauswahl der Vorlage ist ungültig';
    end if;
    for linked_id in
      select value::uuid from jsonb_array_elements_text(new.configuration->'displayIds')
    loop
      if not exists (
        select 1 from swisscompact.tenant_displays display
        where display.id = linked_id and display.tenant_id = new.tenant_id
      ) then
        raise exception 'Ein Vorlagenbildschirm gehört nicht zu diesem Kundenportal';
      end if;
    end loop;
  end if;

  if new.configuration ? 'targetAssignments' then
    if jsonb_typeof(new.configuration->'targetAssignments') <> 'array' then
      raise exception 'Die Playlist-Zuordnung der Vorlage ist ungültig';
    end if;
    for assignment in
      select value from jsonb_array_elements(new.configuration->'targetAssignments')
    loop
      linked_id := nullif(assignment->>'displayId', '')::uuid;
      if linked_id is null or not exists (
        select 1 from swisscompact.tenant_displays display
        where display.id = linked_id and display.tenant_id = new.tenant_id
      ) then
        raise exception 'Eine Playlist gehört nicht zu einem Bildschirm dieses Kundenportals';
      end if;
      if jsonb_typeof(assignment->'contentItems') is distinct from 'array' then
        raise exception 'Eine Vorlagen-Playlist ist ungültig';
      end if;
      for content_item in
        select value from jsonb_array_elements(assignment->'contentItems')
      loop
        linked_id := nullif(content_item->>'contentId', '')::uuid;
        if linked_id is null or not exists (
          select 1 from swisscompact.tenant_content content
          where content.id = linked_id and content.tenant_id = new.tenant_id
        ) then
          raise exception 'Ein Vorlageninhalt gehört nicht zu diesem Kundenportal';
        end if;
      end loop;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists tenant_campaign_templates_validate_scope
  on swisscompact.tenant_campaign_templates;
create trigger tenant_campaign_templates_validate_scope
before insert or update on swisscompact.tenant_campaign_templates
for each row execute function swisscompact.validate_campaign_template_scope();

alter table swisscompact.tenant_campaign_templates enable row level security;

drop policy if exists tenant_campaign_templates_read
  on swisscompact.tenant_campaign_templates;
create policy tenant_campaign_templates_read
on swisscompact.tenant_campaign_templates for select
using (swisscompact.is_tenant_member(tenant_id));

drop policy if exists tenant_campaign_templates_write
  on swisscompact.tenant_campaign_templates;
create policy tenant_campaign_templates_write
on swisscompact.tenant_campaign_templates for all
using (swisscompact.can_edit_tenant(tenant_id))
with check (swisscompact.can_edit_tenant(tenant_id));

revoke all on function swisscompact.validate_campaign_template_scope()
  from public, anon, authenticated;
grant select, insert, update, delete on swisscompact.tenant_campaign_templates
  to authenticated, service_role;

commit;
