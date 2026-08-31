-- Gemeinsame Produktionsakte: Briefing, Kommunikation, Versionen und Kundenfreigaben.
begin;

update storage.buckets
set file_size_limit = greatest(coalesce(file_size_limit, 0), 262144000),
    allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/webm','application/pdf']
where id = 'swisscompact-media';

alter table swisscompact.projects
  add column if not exists tenant_id uuid references swisscompact.tenants(id) on delete restrict,
  add column if not exists briefing jsonb not null default '{}'::jsonb;

update swisscompact.projects project
set tenant_id = tenant.id
from swisscompact.tenants tenant
where project.tenant_id is null
  and tenant.client_id = project.client_id;

create index if not exists projects_tenant_idx on swisscompact.projects(tenant_id, updated_at desc);

create table if not exists swisscompact.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references swisscompact.projects(id) on delete cascade,
  client_id uuid not null references swisscompact.clients(id) on delete cascade,
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  author_type text not null check (author_type in ('swisscompact','customer','system')),
  author_name text not null,
  body text not null check (length(trim(body)) between 1 and 5000),
  visible_to_customer boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists project_messages_project_idx
  on swisscompact.project_messages(project_id, created_at);

create table if not exists swisscompact.project_deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references swisscompact.projects(id) on delete cascade,
  client_id uuid not null references swisscompact.clients(id) on delete cascade,
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  title text not null,
  kind text not null default 'design' check (kind in ('image','video','design','document','campaign','reference')),
  status text not null default 'draft' check (status in ('draft','received','customer_review','changes_requested','approved','delivered','archived','published')),
  current_version integer not null default 0 check (current_version >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_deliverables_project_idx
  on swisscompact.project_deliverables(project_id, updated_at desc);

create table if not exists swisscompact.project_deliverable_versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references swisscompact.project_deliverables(id) on delete cascade,
  project_id uuid not null references swisscompact.projects(id) on delete cascade,
  client_id uuid not null references swisscompact.clients(id) on delete cascade,
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  version integer not null check (version > 0),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 262144000),
  notes text,
  upload_state text not null default 'uploading' check (upload_state in ('uploading','ready','failed')),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_by_type text not null check (submitted_by_type in ('swisscompact','customer')),
  created_at timestamptz not null default now(),
  unique (deliverable_id, version)
);
create index if not exists project_deliverable_versions_project_idx
  on swisscompact.project_deliverable_versions(project_id, created_at desc);

create table if not exists swisscompact.project_review_decisions (
  id uuid primary key default gen_random_uuid(),
  deliverable_version_id uuid not null unique references swisscompact.project_deliverable_versions(id) on delete cascade,
  project_id uuid not null references swisscompact.projects(id) on delete cascade,
  client_id uuid not null references swisscompact.clients(id) on delete cascade,
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  decision text not null check (decision in ('approved','changes_requested')),
  feedback text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_by_name text not null,
  decided_by_email text not null,
  created_at timestamptz not null default now()
);
create index if not exists project_review_decisions_project_idx
  on swisscompact.project_review_decisions(project_id, created_at desc);

create table if not exists swisscompact.project_revision_rounds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references swisscompact.projects(id) on delete cascade,
  deliverable_id uuid not null references swisscompact.project_deliverables(id) on delete cascade,
  client_id uuid not null references swisscompact.clients(id) on delete cascade,
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  status text not null default 'requested' check (status in ('requested','scoping','customer_approval','approved','declined','in_progress','completed')),
  request_text text not null,
  response_text text,
  included boolean,
  additional_cost_chf numeric(12,2) check (additional_cost_chf is null or additional_cost_chf >= 0),
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deliverable_id, round_number)
);
create index if not exists project_revision_rounds_project_idx
  on swisscompact.project_revision_rounds(project_id, created_at desc);

create or replace function swisscompact.validate_project_collaboration_scope()
returns trigger language plpgsql security definer set search_path = swisscompact, public as $$
begin
  if not exists (
    select 1
    from swisscompact.projects project
    join swisscompact.tenants tenant on tenant.id = new.tenant_id
    where project.id = new.project_id
      and project.client_id = new.client_id
      and tenant.client_id = new.client_id
      and (project.tenant_id is null or project.tenant_id = new.tenant_id)
  ) then
    raise exception 'Projekt, Kunde und Portal gehören nicht zusammen';
  end if;
  return new;
end;
$$;

drop trigger if exists project_messages_validate_scope on swisscompact.project_messages;
create trigger project_messages_validate_scope before insert or update
on swisscompact.project_messages for each row execute function swisscompact.validate_project_collaboration_scope();
drop trigger if exists project_deliverables_validate_scope on swisscompact.project_deliverables;
create trigger project_deliverables_validate_scope before insert or update
on swisscompact.project_deliverables for each row execute function swisscompact.validate_project_collaboration_scope();
drop trigger if exists project_deliverable_versions_validate_scope on swisscompact.project_deliverable_versions;
create trigger project_deliverable_versions_validate_scope before insert or update
on swisscompact.project_deliverable_versions for each row execute function swisscompact.validate_project_collaboration_scope();
drop trigger if exists project_review_decisions_validate_scope on swisscompact.project_review_decisions;
create trigger project_review_decisions_validate_scope before insert or update
on swisscompact.project_review_decisions for each row execute function swisscompact.validate_project_collaboration_scope();
drop trigger if exists project_revision_rounds_validate_scope on swisscompact.project_revision_rounds;
create trigger project_revision_rounds_validate_scope before insert or update
on swisscompact.project_revision_rounds for each row execute function swisscompact.validate_project_collaboration_scope();

alter table swisscompact.project_messages enable row level security;
alter table swisscompact.project_deliverables enable row level security;
alter table swisscompact.project_deliverable_versions enable row level security;
alter table swisscompact.project_review_decisions enable row level security;
alter table swisscompact.project_revision_rounds enable row level security;

drop policy if exists dashboard_project_messages_admin on swisscompact.project_messages;
create policy dashboard_project_messages_admin on swisscompact.project_messages for all
using (swisscompact.is_dashboard_admin()) with check (swisscompact.is_dashboard_admin());
drop policy if exists dashboard_project_deliverables_admin on swisscompact.project_deliverables;
create policy dashboard_project_deliverables_admin on swisscompact.project_deliverables for all
using (swisscompact.is_dashboard_admin()) with check (swisscompact.is_dashboard_admin());
drop policy if exists dashboard_project_deliverable_versions_admin on swisscompact.project_deliverable_versions;
create policy dashboard_project_deliverable_versions_admin on swisscompact.project_deliverable_versions for all
using (swisscompact.is_dashboard_admin()) with check (swisscompact.is_dashboard_admin());
drop policy if exists dashboard_project_review_decisions_admin on swisscompact.project_review_decisions;
create policy dashboard_project_review_decisions_admin on swisscompact.project_review_decisions for all
using (swisscompact.is_dashboard_admin()) with check (swisscompact.is_dashboard_admin());
drop policy if exists dashboard_project_revision_rounds_admin on swisscompact.project_revision_rounds;
create policy dashboard_project_revision_rounds_admin on swisscompact.project_revision_rounds for all
using (swisscompact.is_dashboard_admin()) with check (swisscompact.is_dashboard_admin());

revoke all on function swisscompact.validate_project_collaboration_scope() from public;
grant select, insert, update, delete on swisscompact.project_messages,
  swisscompact.project_deliverables, swisscompact.project_deliverable_versions,
  swisscompact.project_review_decisions, swisscompact.project_revision_rounds
  to authenticated, service_role;

commit;
