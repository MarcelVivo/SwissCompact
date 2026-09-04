-- Fixes PL/pgSQL's ambiguous document_id reference in the mandatory legal-consent flow.
-- The original variable name shadowed legal_acceptances.document_id inside EXISTS clauses.
begin;

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
  legal_document swisscompact.legal_documents%rowtype;
  target_document_id uuid;
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

  foreach target_document_id in array target_documents loop
    acceptance_id := null;
    select * into legal_document
    from swisscompact.legal_documents
    where id = target_document_id
      and status = 'published'
      and effective_at <= now();
    if legal_document.id is null then raise exception 'Ein Rechtsdokument ist nicht mehr aktuell'; end if;
    if legal_document.acceptance_scope = 'tenant' and membership.role not in ('owner','admin') then
      raise exception 'Dieses Dokument muss durch einen Inhaber oder Administrator bestätigt werden';
    end if;

    if legal_document.acceptance_scope = 'user' and exists (
      select 1
      from swisscompact.legal_acceptances as existing_acceptance
      where existing_acceptance.document_id = legal_document.id
        and existing_acceptance.tenant_id = target_tenant
        and existing_acceptance.user_id = auth.uid()
        and existing_acceptance.acceptance_scope_snapshot = 'user'
    ) then
      continue;
    end if;
    if legal_document.acceptance_scope = 'tenant' and exists (
      select 1
      from swisscompact.legal_acceptances as existing_acceptance
      where existing_acceptance.document_id = legal_document.id
        and existing_acceptance.tenant_id = target_tenant
        and existing_acceptance.acceptance_scope_snapshot = 'tenant'
    ) then
      continue;
    end if;

    insert into swisscompact.legal_acceptances (
      document_id, tenant_id, membership_id, user_id,
      document_type_snapshot, acceptance_scope_snapshot,
      version_snapshot, title_snapshot, content_hash_snapshot, request_metadata
    ) values (
      legal_document.id, target_tenant, membership.id, auth.uid(),
      legal_document.document_type, legal_document.acceptance_scope,
      legal_document.version, legal_document.title, legal_document.content_hash,
      acceptance_metadata || jsonb_build_object('source', 'customer_portal')
    ) on conflict do nothing
    returning id into acceptance_id;
    if acceptance_id is null then continue; end if;

    insert into swisscompact.tenant_audit_log (
      tenant_id, actor_user_id, action, entity_type, entity_id, metadata
    ) values (
      target_tenant, auth.uid(), 'legal_document_accepted', 'legal_acceptance', acceptance_id,
      jsonb_build_object(
        'documentId', legal_document.id,
        'documentType', legal_document.document_type,
        'version', legal_document.version,
        'contentHash', legal_document.content_hash,
        'acceptanceScope', legal_document.acceptance_scope
      )
    );
    accepted_count := accepted_count + 1;
  end loop;

  return accepted_count;
end;
$$;

revoke all on function swisscompact.accept_legal_documents(uuid,uuid[],jsonb) from public, anon;
grant execute on function swisscompact.accept_legal_documents(uuid,uuid[],jsonb) to authenticated, service_role;

commit;
