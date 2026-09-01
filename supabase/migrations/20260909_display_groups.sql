-- Skalierbare Bildschirmverwaltung mit wiederverwendbaren Gruppen.
begin;

create table if not exists swisscompact.tenant_display_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 180),
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tenant_display_groups_name_unique
  on swisscompact.tenant_display_groups(tenant_id, lower(trim(name)));
create index if not exists tenant_display_groups_recent_idx
  on swisscompact.tenant_display_groups(tenant_id, updated_at desc);

create table if not exists swisscompact.tenant_display_group_members (
  group_id uuid not null references swisscompact.tenant_display_groups(id) on delete cascade,
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  display_id uuid not null references swisscompact.tenant_displays(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, display_id)
);
create index if not exists tenant_display_group_members_display_idx
  on swisscompact.tenant_display_group_members(tenant_id, display_id);

create or replace function swisscompact.validate_display_group_member_scope()
returns trigger
language plpgsql
security definer
set search_path = swisscompact, public
as $$
begin
  if not exists (
    select 1 from swisscompact.tenant_display_groups display_group
    where display_group.id = new.group_id and display_group.tenant_id = new.tenant_id
  ) then
    raise exception 'Die Bildschirmgruppe gehört nicht zu diesem Kundenportal';
  end if;
  if not exists (
    select 1 from swisscompact.tenant_displays display
    where display.id = new.display_id and display.tenant_id = new.tenant_id
  ) then
    raise exception 'Der Bildschirm gehört nicht zu diesem Kundenportal';
  end if;
  return new;
end;
$$;

drop trigger if exists tenant_display_group_members_validate_scope
  on swisscompact.tenant_display_group_members;
create trigger tenant_display_group_members_validate_scope
before insert or update on swisscompact.tenant_display_group_members
for each row execute function swisscompact.validate_display_group_member_scope();

create or replace function swisscompact.save_display_group(
  target_tenant uuid,
  target_group uuid,
  group_name text,
  group_description text,
  target_display_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  saved_group uuid;
  clean_name text := trim(group_name);
begin
  if auth.role() <> 'service_role' and not swisscompact.can_edit_tenant(target_tenant) then
    raise exception 'Kein Bearbeitungszugriff auf dieses Kundenportal';
  end if;
  if clean_name is null or char_length(clean_name) not between 1 and 180 then
    raise exception 'Geben Sie einen gültigen Gruppennamen ein';
  end if;
  if exists (
    select 1 from unnest(coalesce(target_display_ids, array[]::uuid[])) as selected(display_id)
    where not exists (
      select 1 from swisscompact.tenant_displays display
      where display.id = selected.display_id and display.tenant_id = target_tenant
    )
  ) then
    raise exception 'Mindestens ein Bildschirm gehört nicht zu diesem Kundenportal';
  end if;

  if target_group is null then
    insert into swisscompact.tenant_display_groups (
      tenant_id, name, description, created_by
    ) values (
      target_tenant, clean_name, nullif(trim(group_description), ''), auth.uid()
    ) returning id into saved_group;
  else
    update swisscompact.tenant_display_groups
    set name = clean_name,
        description = nullif(trim(group_description), ''),
        updated_at = now()
    where id = target_group and tenant_id = target_tenant
    returning id into saved_group;
    if saved_group is null then raise exception 'Bildschirmgruppe nicht gefunden'; end if;
  end if;

  delete from swisscompact.tenant_display_group_members
  where group_id = saved_group and tenant_id = target_tenant;

  insert into swisscompact.tenant_display_group_members (
    group_id, tenant_id, display_id, added_by
  )
  select saved_group, target_tenant, display_id, auth.uid()
  from (select distinct unnest(coalesce(target_display_ids, array[]::uuid[])) as display_id) selected;

  return saved_group;
end;
$$;

alter table swisscompact.tenant_display_groups enable row level security;
alter table swisscompact.tenant_display_group_members enable row level security;

drop policy if exists tenant_display_groups_read on swisscompact.tenant_display_groups;
create policy tenant_display_groups_read on swisscompact.tenant_display_groups for select
using (swisscompact.is_tenant_member(tenant_id));
drop policy if exists tenant_display_groups_write on swisscompact.tenant_display_groups;
create policy tenant_display_groups_write on swisscompact.tenant_display_groups for all
using (swisscompact.can_edit_tenant(tenant_id))
with check (swisscompact.can_edit_tenant(tenant_id));

drop policy if exists tenant_display_group_members_read on swisscompact.tenant_display_group_members;
create policy tenant_display_group_members_read on swisscompact.tenant_display_group_members for select
using (swisscompact.is_tenant_member(tenant_id));
drop policy if exists tenant_display_group_members_write on swisscompact.tenant_display_group_members;
create policy tenant_display_group_members_write on swisscompact.tenant_display_group_members for all
using (swisscompact.can_edit_tenant(tenant_id))
with check (swisscompact.can_edit_tenant(tenant_id));

revoke all on function swisscompact.validate_display_group_member_scope(),
  swisscompact.save_display_group(uuid,uuid,text,text,uuid[]) from public, anon;
grant execute on function swisscompact.save_display_group(uuid,uuid,text,text,uuid[])
  to authenticated, service_role;
grant select, insert, update, delete on swisscompact.tenant_display_groups,
  swisscompact.tenant_display_group_members to authenticated, service_role;

commit;
