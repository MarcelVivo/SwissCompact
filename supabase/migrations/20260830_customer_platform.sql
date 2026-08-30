-- Mandantenfähige Grundlage für Business Dashboards und das SwissCompact Display Portal.
create table if not exists swisscompact.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('onboarding','active','paused','cancelled')),
  branding jsonb not null default '{}'::jsonb,
  enabled_modules jsonb not null default '["portal"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists swisscompact.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  hostname text not null,
  purpose text not null check (purpose in ('portal','dashboard')),
  verified boolean not null default false,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists tenant_domains_hostname_unique on swisscompact.tenant_domains(lower(hostname));

create table if not exists swisscompact.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','admin','editor','viewer')),
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(tenant_id, user_id)
);

create table if not exists swisscompact.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  package_code text not null references swisscompact.subscription_packages(code),
  status text not null default 'trial' check (status in ('trial','active','past_due','paused','cancelled')),
  starts_on date not null default current_date,
  minimum_ends_on date,
  monthly_amount_chf numeric(12,2),
  included_ai_credits numeric(12,2),
  billing_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tenant_subscriptions_active_unique
  on swisscompact.tenant_subscriptions(tenant_id)
  where status in ('trial','active','past_due','paused');

create table if not exists swisscompact.tenant_sites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  name text not null,
  address jsonb not null default '{}'::jsonb,
  timezone text not null default 'Europe/Zurich',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists swisscompact.tenant_displays (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  site_id uuid references swisscompact.tenant_sites(id) on delete set null,
  name text not null,
  device_key text unique,
  kind text not null default 'display' check (kind in ('display','led_wall','led_controller','player')),
  status text not null default 'provisioning' check (status in ('provisioning','online','offline','maintenance','retired')),
  orientation text check (orientation in ('landscape','portrait','custom')),
  resolution jsonb not null default '{}'::jsonb,
  configuration jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists swisscompact.tenant_content (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  title text not null,
  content_type text not null default 'composition' check (content_type in ('image','video','text','composition','template','web')),
  status text not null default 'draft' check (status in ('draft','review','approved','published','archived')),
  payload jsonb not null default '{}'::jsonb,
  asset_path text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists swisscompact.tenant_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft','review','scheduled','active','paused','completed','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  schedule jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists swisscompact.tenant_campaign_content (
  campaign_id uuid not null references swisscompact.tenant_campaigns(id) on delete cascade,
  content_id uuid not null references swisscompact.tenant_content(id) on delete cascade,
  position integer not null default 0,
  duration_seconds integer,
  primary key(campaign_id, content_id)
);

create table if not exists swisscompact.tenant_campaign_displays (
  campaign_id uuid not null references swisscompact.tenant_campaigns(id) on delete cascade,
  display_id uuid not null references swisscompact.tenant_displays(id) on delete cascade,
  primary key(campaign_id, display_id)
);

create table if not exists swisscompact.tenant_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function swisscompact.is_tenant_member(target_tenant uuid)
returns boolean language sql stable security definer set search_path = swisscompact, public as $$
  select swisscompact.is_dashboard_admin() or exists (
    select 1 from swisscompact.tenant_memberships
    where tenant_id = target_tenant and user_id = auth.uid() and active
  );
$$;

create or replace function swisscompact.can_edit_tenant(target_tenant uuid)
returns boolean language sql stable security definer set search_path = swisscompact, public as $$
  select swisscompact.is_dashboard_admin() or exists (
    select 1 from swisscompact.tenant_memberships
    where tenant_id = target_tenant and user_id = auth.uid() and active and role in ('owner','admin','editor')
  );
$$;

alter table swisscompact.tenants enable row level security;
alter table swisscompact.tenant_domains enable row level security;
alter table swisscompact.tenant_memberships enable row level security;
alter table swisscompact.tenant_subscriptions enable row level security;
alter table swisscompact.tenant_sites enable row level security;
alter table swisscompact.tenant_displays enable row level security;
alter table swisscompact.tenant_content enable row level security;
alter table swisscompact.tenant_campaigns enable row level security;
alter table swisscompact.tenant_campaign_content enable row level security;
alter table swisscompact.tenant_campaign_displays enable row level security;
alter table swisscompact.tenant_audit_log enable row level security;

drop policy if exists tenant_read on swisscompact.tenants;
create policy tenant_read on swisscompact.tenants for select using (swisscompact.is_tenant_member(id));
drop policy if exists tenant_admin_write on swisscompact.tenants;
create policy tenant_admin_write on swisscompact.tenants for all using (swisscompact.is_dashboard_admin()) with check (swisscompact.is_dashboard_admin());

drop policy if exists tenant_domains_read on swisscompact.tenant_domains;
create policy tenant_domains_read on swisscompact.tenant_domains for select using (swisscompact.is_tenant_member(tenant_id));
drop policy if exists tenant_domains_admin on swisscompact.tenant_domains;
create policy tenant_domains_admin on swisscompact.tenant_domains for all using (swisscompact.is_dashboard_admin()) with check (swisscompact.is_dashboard_admin());

drop policy if exists tenant_memberships_read on swisscompact.tenant_memberships;
create policy tenant_memberships_read on swisscompact.tenant_memberships for select using (swisscompact.is_tenant_member(tenant_id));
drop policy if exists tenant_memberships_admin on swisscompact.tenant_memberships;
create policy tenant_memberships_admin on swisscompact.tenant_memberships for all using (swisscompact.is_dashboard_admin()) with check (swisscompact.is_dashboard_admin());

drop policy if exists tenant_subscriptions_read on swisscompact.tenant_subscriptions;
create policy tenant_subscriptions_read on swisscompact.tenant_subscriptions for select using (swisscompact.is_tenant_member(tenant_id));
drop policy if exists tenant_subscriptions_admin on swisscompact.tenant_subscriptions;
create policy tenant_subscriptions_admin on swisscompact.tenant_subscriptions for all using (swisscompact.is_dashboard_admin()) with check (swisscompact.is_dashboard_admin());

do $$
declare table_name text;
begin
  foreach table_name in array array['tenant_sites','tenant_displays','tenant_content','tenant_campaigns','tenant_audit_log'] loop
    execute format('drop policy if exists %I_read on swisscompact.%I', table_name, table_name);
    execute format('create policy %I_read on swisscompact.%I for select using (swisscompact.is_tenant_member(tenant_id))', table_name, table_name);
    execute format('drop policy if exists %I_write on swisscompact.%I', table_name, table_name);
    execute format('create policy %I_write on swisscompact.%I for all using (swisscompact.can_edit_tenant(tenant_id)) with check (swisscompact.can_edit_tenant(tenant_id))', table_name, table_name);
  end loop;
end $$;

drop policy if exists tenant_campaign_content_read on swisscompact.tenant_campaign_content;
create policy tenant_campaign_content_read on swisscompact.tenant_campaign_content for select using (
  exists (select 1 from swisscompact.tenant_campaigns c where c.id = campaign_id and swisscompact.is_tenant_member(c.tenant_id))
);
drop policy if exists tenant_campaign_content_write on swisscompact.tenant_campaign_content;
create policy tenant_campaign_content_write on swisscompact.tenant_campaign_content for all using (
  exists (select 1 from swisscompact.tenant_campaigns c where c.id = campaign_id and swisscompact.can_edit_tenant(c.tenant_id))
) with check (
  exists (select 1 from swisscompact.tenant_campaigns c where c.id = campaign_id and swisscompact.can_edit_tenant(c.tenant_id))
);

drop policy if exists tenant_campaign_displays_read on swisscompact.tenant_campaign_displays;
create policy tenant_campaign_displays_read on swisscompact.tenant_campaign_displays for select using (
  exists (select 1 from swisscompact.tenant_campaigns c where c.id = campaign_id and swisscompact.is_tenant_member(c.tenant_id))
);
drop policy if exists tenant_campaign_displays_write on swisscompact.tenant_campaign_displays;
create policy tenant_campaign_displays_write on swisscompact.tenant_campaign_displays for all using (
  exists (select 1 from swisscompact.tenant_campaigns c where c.id = campaign_id and swisscompact.can_edit_tenant(c.tenant_id))
) with check (
  exists (select 1 from swisscompact.tenant_campaigns c where c.id = campaign_id and swisscompact.can_edit_tenant(c.tenant_id))
);

grant select, insert, update, delete on all tables in schema swisscompact to authenticated, service_role;
grant execute on function swisscompact.is_tenant_member(uuid), swisscompact.can_edit_tenant(uuid) to authenticated, service_role;

-- Interner Demo-Mandant: ermöglicht den beiden SwissCompact-Admins den Portaltest.
insert into swisscompact.tenants (name, slug, status, branding, enabled_modules)
values ('SwissCompact Demo', 'swisscompact-demo', 'active', '{"accent":"#c8102e"}'::jsonb, '["portal","content","campaigns","displays","ai"]'::jsonb)
on conflict (slug) do update set updated_at = now();

insert into swisscompact.tenant_memberships (tenant_id, user_id, role, display_name)
select t.id, u.id, 'owner', coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
from swisscompact.tenants t
join auth.users u on lower(u.email) in ('kontakt@swisscompact.com','thomas.peter@swisscompact.com')
where t.slug = 'swisscompact-demo'
on conflict (tenant_id, user_id) do update set active = true, role = 'owner';

insert into swisscompact.tenant_subscriptions (tenant_id, package_code, status, minimum_ends_on)
select id, 'enterprise', 'active', (current_date + interval '12 months')::date
from swisscompact.tenants where slug = 'swisscompact-demo'
on conflict do nothing;
