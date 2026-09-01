-- Versionierte Rechtsdokumente und unveränderbare Zustimmungsnachweise.
begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists swisscompact.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null
    check (document_type in ('terms','privacy','data_processing')),
  acceptance_scope text not null default 'user'
    check (acceptance_scope in ('user','tenant')),
  version text not null check (char_length(trim(version)) between 1 and 40),
  title text not null check (char_length(trim(title)) between 1 and 180),
  summary text not null default '' check (char_length(summary) <= 1000),
  content_markdown text not null check (char_length(content_markdown) between 1 and 200000),
  requires_acceptance boolean not null default true,
  status text not null default 'draft'
    check (status in ('draft','published','superseded')),
  effective_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  unique (document_type, version),
  check (status = 'draft' or (published_at is not null and effective_at is not null))
);

create unique index if not exists legal_documents_one_current_type_idx
  on swisscompact.legal_documents(document_type)
  where status = 'published';
create index if not exists legal_documents_history_idx
  on swisscompact.legal_documents(document_type, published_at desc)
  where status in ('published','superseded');

-- PostgreSQL akzeptiert convert_to(...) nicht in einer GENERATED-Spalte, da
-- die Funktion nicht als immutable markiert ist. Der Trigger berechnet
-- denselben SHA-256-Wert vor jeder relevanten Änderung zuverlässig neu.
create or replace function swisscompact.set_legal_document_hash()
returns trigger
language plpgsql
security definer
set search_path = swisscompact, public
as $$
begin
  new.content_hash := encode(extensions.digest(convert_to(
    new.document_type || E'\n' || new.acceptance_scope || E'\n' || new.version || E'\n' ||
    new.title || E'\n' || new.summary || E'\n' || new.content_markdown,
    'UTF8'
  ), 'sha256'::text), 'hex');
  return new;
end;
$$;

drop trigger if exists legal_documents_set_hash on swisscompact.legal_documents;
create trigger legal_documents_set_hash
before insert or update of document_type, acceptance_scope, version, title, summary, content_markdown
on swisscompact.legal_documents
for each row execute function swisscompact.set_legal_document_hash();

create table if not exists swisscompact.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references swisscompact.legal_documents(id) on delete restrict,
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  membership_id uuid references swisscompact.tenant_memberships(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  document_type_snapshot text not null
    check (document_type_snapshot in ('terms','privacy','data_processing')),
  acceptance_scope_snapshot text not null
    check (acceptance_scope_snapshot in ('user','tenant')),
  version_snapshot text not null,
  title_snapshot text not null,
  content_hash_snapshot text not null check (content_hash_snapshot ~ '^[a-f0-9]{64}$'),
  accepted_at timestamptz not null default now(),
  request_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(request_metadata) = 'object')
);

create unique index if not exists legal_acceptances_user_once_idx
  on swisscompact.legal_acceptances(document_id, tenant_id, user_id)
  where acceptance_scope_snapshot = 'user';
create unique index if not exists legal_acceptances_tenant_once_idx
  on swisscompact.legal_acceptances(document_id, tenant_id)
  where acceptance_scope_snapshot = 'tenant';
create index if not exists legal_acceptances_tenant_history_idx
  on swisscompact.legal_acceptances(tenant_id, accepted_at desc);

create or replace function swisscompact.protect_legal_records()
returns trigger
language plpgsql
security definer
set search_path = swisscompact, public
as $$
begin
  if tg_table_name = 'legal_acceptances' then
    raise exception 'Zustimmungsnachweise sind unveränderbar';
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Veröffentlichte Rechtsdokumente dürfen nicht gelöscht werden';
    end if;
    return old;
  end if;

  if old.status in ('published','superseded') then
    if old.status = 'published'
      and new.status = 'superseded'
      and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status') then
      return new;
    end if;
    raise exception 'Veröffentlichte Rechtsdokumente sind unveränderbar';
  end if;
  return new;
end;
$$;

drop trigger if exists legal_documents_immutable on swisscompact.legal_documents;
create trigger legal_documents_immutable
before update or delete on swisscompact.legal_documents
for each row execute function swisscompact.protect_legal_records();

drop trigger if exists legal_acceptances_immutable on swisscompact.legal_acceptances;
create trigger legal_acceptances_immutable
before update or delete on swisscompact.legal_acceptances
for each row execute function swisscompact.protect_legal_records();

create or replace function swisscompact.publish_legal_document(target_document uuid)
returns uuid
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  target swisscompact.legal_documents%rowtype;
begin
  if auth.role() <> 'service_role' and not swisscompact.is_dashboard_admin() then
    raise exception 'Nur die SwissCompact-Verwaltung darf Rechtsdokumente veröffentlichen';
  end if;

  select * into target
  from swisscompact.legal_documents
  where id = target_document and status = 'draft'
  for update;
  if target.id is null then raise exception 'Veröffentlichbarer Entwurf nicht gefunden'; end if;
  if position('ENTWURF' in upper(target.content_markdown)) > 0 then
    raise exception 'Ein als Entwurf gekennzeichneter Text darf nicht veröffentlicht werden';
  end if;

  update swisscompact.legal_documents
  set status = 'superseded'
  where document_type = target.document_type and status = 'published';

  update swisscompact.legal_documents
  set status = 'published',
      published_at = now(),
      effective_at = coalesce(effective_at, now())
  where id = target.id;

  return target.id;
end;
$$;

create or replace function swisscompact.accept_legal_documents(
  target_tenant uuid,
  target_documents uuid[],
  acceptance_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  membership swisscompact.tenant_memberships%rowtype;
  document swisscompact.legal_documents%rowtype;
  document_id uuid;
  acceptance_id uuid;
  accepted_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
  if coalesce(array_length(target_documents, 1), 0) < 1
    or coalesce(array_length(target_documents, 1), 0) > 10 then
    raise exception 'Wählen Sie mindestens ein gültiges Dokument';
  end if;
  if acceptance_metadata is null or jsonb_typeof(acceptance_metadata) <> 'object' then
    raise exception 'Ungültige Zustimmungsmetadaten';
  end if;

  select * into membership
  from swisscompact.tenant_memberships
  where tenant_id = target_tenant
    and user_id = auth.uid()
    and active
    and access_status = 'active'
    and verified_at is not null
  order by created_at
  limit 1;
  if membership.id is null or not swisscompact.is_tenant_member(target_tenant) then
    raise exception 'Kein bestätigter Portalzugriff';
  end if;

  foreach document_id in array target_documents loop
    acceptance_id := null;
    select * into document
    from swisscompact.legal_documents
    where id = document_id
      and status = 'published'
      and effective_at <= now();
    if document.id is null then raise exception 'Ein Rechtsdokument ist nicht mehr aktuell'; end if;
    if document.acceptance_scope = 'tenant' and membership.role not in ('owner','admin') then
      raise exception 'Dieses Dokument muss durch einen Inhaber oder Administrator bestätigt werden';
    end if;

    if document.acceptance_scope = 'user' and exists (
      select 1 from swisscompact.legal_acceptances
      where document_id = document.id and tenant_id = target_tenant and user_id = auth.uid()
        and acceptance_scope_snapshot = 'user'
    ) then
      continue;
    end if;
    if document.acceptance_scope = 'tenant' and exists (
      select 1 from swisscompact.legal_acceptances
      where document_id = document.id and tenant_id = target_tenant
        and acceptance_scope_snapshot = 'tenant'
    ) then
      continue;
    end if;

    insert into swisscompact.legal_acceptances (
      document_id, tenant_id, membership_id, user_id,
      document_type_snapshot, acceptance_scope_snapshot,
      version_snapshot, title_snapshot, content_hash_snapshot, request_metadata
    ) values (
      document.id, target_tenant, membership.id, auth.uid(),
      document.document_type, document.acceptance_scope,
      document.version, document.title, document.content_hash,
      acceptance_metadata || jsonb_build_object('source', 'customer_portal')
    ) on conflict do nothing
    returning id into acceptance_id;
    if acceptance_id is null then continue; end if;

    insert into swisscompact.tenant_audit_log (
      tenant_id, actor_user_id, action, entity_type, entity_id, metadata
    ) values (
      target_tenant, auth.uid(), 'legal_document_accepted', 'legal_acceptance', acceptance_id,
      jsonb_build_object(
        'documentId', document.id,
        'documentType', document.document_type,
        'version', document.version,
        'contentHash', document.content_hash,
        'acceptanceScope', document.acceptance_scope
      )
    );
    accepted_count := accepted_count + 1;
  end loop;

  return accepted_count;
end;
$$;

alter table swisscompact.legal_documents enable row level security;
alter table swisscompact.legal_acceptances enable row level security;

drop policy if exists legal_documents_read on swisscompact.legal_documents;
create policy legal_documents_read on swisscompact.legal_documents for select
using (
  status in ('published','superseded')
  and auth.uid() is not null
);

drop policy if exists legal_acceptances_read on swisscompact.legal_acceptances;
create policy legal_acceptances_read on swisscompact.legal_acceptances for select
using (
  swisscompact.is_tenant_member(tenant_id)
  and (
    user_id = auth.uid()
    or acceptance_scope_snapshot = 'tenant'
    or swisscompact.is_dashboard_admin()
  )
);

revoke all on function swisscompact.set_legal_document_hash(),
  swisscompact.protect_legal_records(),
  swisscompact.publish_legal_document(uuid),
  swisscompact.accept_legal_documents(uuid,uuid[],jsonb) from public, anon;
grant execute on function swisscompact.publish_legal_document(uuid) to authenticated, service_role;
grant execute on function swisscompact.accept_legal_documents(uuid,uuid[],jsonb) to authenticated, service_role;
grant select on swisscompact.legal_documents, swisscompact.legal_acceptances to authenticated, service_role;
grant insert, update, delete on swisscompact.legal_documents to service_role;

-- Sichere Arbeitsentwürfe: Sie werden weder angezeigt noch müssen sie bestätigt
-- werden. Vor der Veröffentlichung sind sie durch geprüfte Rechtstexte zu ersetzen.
insert into swisscompact.legal_documents (
  document_type, acceptance_scope, version, title, summary, content_markdown, requires_acceptance
) select seed.* from (values
  ('terms', 'user', '1.0-entwurf', 'Nutzungsbedingungen Kundenportal',
   'Regelt die Nutzung des SwissCompact-Kundenportals.',
   'ENTWURF – Vor Veröffentlichung durch den geprüften Rechtstext ersetzen.', true),
  ('privacy', 'user', '1.0-entwurf', 'Datenschutzerklärung Kundenportal',
   'Informiert über die Bearbeitung personenbezogener Daten im Kundenportal.',
   'ENTWURF – Vor Veröffentlichung durch den geprüften Rechtstext ersetzen.', true),
  ('data_processing', 'tenant', '1.0-entwurf', 'Auftragsverarbeitung',
   'Vereinbarung zur Auftragsbearbeitung zwischen dem Kundenbetrieb und SwissCompact.',
   'ENTWURF – Vor Veröffentlichung durch den geprüften Rechtstext ersetzen.', true)
) as seed(document_type, acceptance_scope, version, title, summary, content_markdown, requires_acceptance)
where not exists (
  select 1 from swisscompact.legal_documents existing
  where existing.document_type = seed.document_type
)
on conflict (document_type, version) do nothing;

commit;
