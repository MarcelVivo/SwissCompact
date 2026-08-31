-- Skalierbare Kampagnen: Standort-/Bereichshierarchie und eigene Playlists je Ziel-Display.
create table if not exists swisscompact.tenant_areas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  site_id uuid not null references swisscompact.tenant_sites(id) on delete cascade,
  parent_id uuid references swisscompact.tenant_areas(id) on delete set null,
  name text not null,
  kind text not null default 'area' check (kind in ('building','floor','area','zone')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tenant_areas_tenant_site_idx
  on swisscompact.tenant_areas(tenant_id, site_id, parent_id, name);

alter table swisscompact.tenant_displays
  add column if not exists area_id uuid references swisscompact.tenant_areas(id) on delete set null;
create index if not exists tenant_displays_area_idx on swisscompact.tenant_displays(area_id);

alter table swisscompact.tenant_campaigns
  add column if not exists theme text,
  add column if not exists scope_site_id uuid references swisscompact.tenant_sites(id) on delete set null,
  add column if not exists scope_area_id uuid references swisscompact.tenant_areas(id) on delete set null;

create table if not exists swisscompact.tenant_campaign_display_content (
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  campaign_id uuid not null references swisscompact.tenant_campaigns(id) on delete cascade,
  display_id uuid not null references swisscompact.tenant_displays(id) on delete cascade,
  content_id uuid not null references swisscompact.tenant_content(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  duration_seconds integer not null default 10 check (duration_seconds between 5 and 3600),
  created_at timestamptz not null default now(),
  primary key (campaign_id, display_id, content_id)
);
create index if not exists tenant_campaign_display_content_display_idx
  on swisscompact.tenant_campaign_display_content(display_id, campaign_id, position);
create index if not exists tenant_campaign_display_content_content_idx
  on swisscompact.tenant_campaign_display_content(content_id);

create or replace function swisscompact.validate_area_hierarchy()
returns trigger language plpgsql security definer set search_path = swisscompact, public as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from swisscompact.tenant_areas p
    where p.id = new.parent_id and p.tenant_id = new.tenant_id and p.site_id = new.site_id
  ) then
    raise exception 'Übergeordneter Bereich gehört nicht zu diesem Standort';
  end if;
  return new;
end;
$$;
drop trigger if exists tenant_areas_validate_hierarchy on swisscompact.tenant_areas;
create trigger tenant_areas_validate_hierarchy before insert or update
on swisscompact.tenant_areas for each row execute function swisscompact.validate_area_hierarchy();

create or replace function swisscompact.validate_display_area()
returns trigger language plpgsql security definer set search_path = swisscompact, public as $$
begin
  if new.area_id is not null and not exists (
    select 1 from swisscompact.tenant_areas a
    where a.id = new.area_id and a.tenant_id = new.tenant_id and a.site_id = new.site_id
  ) then
    raise exception 'Bildschirmbereich gehört nicht zu diesem Standort';
  end if;
  return new;
end;
$$;
drop trigger if exists tenant_displays_validate_area on swisscompact.tenant_displays;
create trigger tenant_displays_validate_area before insert or update
on swisscompact.tenant_displays for each row execute function swisscompact.validate_display_area();

create or replace function swisscompact.validate_campaign_scope()
returns trigger language plpgsql security definer set search_path = swisscompact, public as $$
begin
  if new.scope_site_id is not null and not exists (
    select 1 from swisscompact.tenant_sites s where s.id = new.scope_site_id and s.tenant_id = new.tenant_id
  ) then
    raise exception 'Kampagnenstandort gehört nicht zu diesem Mandanten';
  end if;
  if new.scope_area_id is not null and not exists (
    select 1 from swisscompact.tenant_areas a
    where a.id = new.scope_area_id and a.tenant_id = new.tenant_id
      and (new.scope_site_id is null or a.site_id = new.scope_site_id)
  ) then
    raise exception 'Kampagnenbereich gehört nicht zu diesem Mandanten oder Standort';
  end if;
  return new;
end;
$$;
drop trigger if exists tenant_campaigns_validate_scope on swisscompact.tenant_campaigns;
create trigger tenant_campaigns_validate_scope before insert or update
on swisscompact.tenant_campaigns for each row execute function swisscompact.validate_campaign_scope();

revoke all on function swisscompact.validate_area_hierarchy(),
  swisscompact.validate_display_area(), swisscompact.validate_campaign_scope() from public;

-- Bestehende Kampagnen behalten ihr Verhalten: die bisherige Playlist wird für jedes Ziel übernommen.
insert into swisscompact.tenant_campaign_display_content
  (tenant_id, campaign_id, display_id, content_id, position, duration_seconds)
select c.tenant_id, cd.campaign_id, cd.display_id, cc.content_id, cc.position,
  greatest(5, least(3600, coalesce(cc.duration_seconds, 10)))
from swisscompact.tenant_campaign_displays cd
join swisscompact.tenant_campaigns c on c.id = cd.campaign_id
join swisscompact.tenant_campaign_content cc on cc.campaign_id = cd.campaign_id
on conflict (campaign_id, display_id, content_id) do nothing;

alter table swisscompact.tenant_areas enable row level security;
alter table swisscompact.tenant_campaign_display_content enable row level security;

drop policy if exists tenant_areas_read on swisscompact.tenant_areas;
create policy tenant_areas_read on swisscompact.tenant_areas for select
using (
  swisscompact.is_tenant_member(tenant_areas.tenant_id)
  and exists (select 1 from swisscompact.tenant_sites s where s.id = tenant_areas.site_id and s.tenant_id = tenant_areas.tenant_id)
);
drop policy if exists tenant_areas_write on swisscompact.tenant_areas;
create policy tenant_areas_write on swisscompact.tenant_areas for all
using (
  swisscompact.can_edit_tenant(tenant_areas.tenant_id)
  and exists (select 1 from swisscompact.tenant_sites s where s.id = tenant_areas.site_id and s.tenant_id = tenant_areas.tenant_id)
)
with check (
  swisscompact.can_edit_tenant(tenant_areas.tenant_id)
  and exists (select 1 from swisscompact.tenant_sites s where s.id = tenant_areas.site_id and s.tenant_id = tenant_areas.tenant_id)
);

drop policy if exists tenant_campaign_display_content_read on swisscompact.tenant_campaign_display_content;
create policy tenant_campaign_display_content_read on swisscompact.tenant_campaign_display_content for select
using (
  swisscompact.is_tenant_member(tenant_campaign_display_content.tenant_id)
  and exists (select 1 from swisscompact.tenant_campaigns c where c.id = tenant_campaign_display_content.campaign_id and c.tenant_id = tenant_campaign_display_content.tenant_id)
  and exists (select 1 from swisscompact.tenant_displays d where d.id = tenant_campaign_display_content.display_id and d.tenant_id = tenant_campaign_display_content.tenant_id)
  and exists (select 1 from swisscompact.tenant_content i where i.id = tenant_campaign_display_content.content_id and i.tenant_id = tenant_campaign_display_content.tenant_id)
);
drop policy if exists tenant_campaign_display_content_write on swisscompact.tenant_campaign_display_content;
create policy tenant_campaign_display_content_write on swisscompact.tenant_campaign_display_content for all
using (
  swisscompact.can_edit_tenant(tenant_campaign_display_content.tenant_id)
  and exists (select 1 from swisscompact.tenant_campaigns c where c.id = tenant_campaign_display_content.campaign_id and c.tenant_id = tenant_campaign_display_content.tenant_id)
  and exists (select 1 from swisscompact.tenant_displays d where d.id = tenant_campaign_display_content.display_id and d.tenant_id = tenant_campaign_display_content.tenant_id)
  and exists (select 1 from swisscompact.tenant_content i where i.id = tenant_campaign_display_content.content_id and i.tenant_id = tenant_campaign_display_content.tenant_id)
)
with check (
  swisscompact.can_edit_tenant(tenant_campaign_display_content.tenant_id)
  and exists (select 1 from swisscompact.tenant_campaigns c where c.id = tenant_campaign_display_content.campaign_id and c.tenant_id = tenant_campaign_display_content.tenant_id)
  and exists (select 1 from swisscompact.tenant_displays d where d.id = tenant_campaign_display_content.display_id and d.tenant_id = tenant_campaign_display_content.tenant_id)
  and exists (select 1 from swisscompact.tenant_content i where i.id = tenant_campaign_display_content.content_id and i.tenant_id = tenant_campaign_display_content.tenant_id)
);

grant select, insert, update, delete on swisscompact.tenant_areas,
  swisscompact.tenant_campaign_display_content to authenticated, service_role;
