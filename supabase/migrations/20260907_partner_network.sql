-- Partnerprogramm: gegenseitige, kontrollierte Werbeangebote zwischen Kundenportalen.
begin;

create table if not exists swisscompact.tenant_partnerships (
  id uuid primary key default gen_random_uuid(),
  tenant_a_id uuid not null references swisscompact.tenants(id) on delete cascade,
  tenant_b_id uuid not null references swisscompact.tenants(id) on delete cascade,
  requested_by_tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  invitation_email text not null,
  message text,
  status text not null default 'pending'
    check (status in ('pending','active','declined','revoked')),
  created_by uuid references auth.users(id) on delete set null,
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tenant_a_id <> tenant_b_id),
  check (tenant_a_id < tenant_b_id),
  check (requested_by_tenant_id in (tenant_a_id, tenant_b_id)),
  unique (tenant_a_id, tenant_b_id)
);
create index if not exists tenant_partnerships_a_idx
  on swisscompact.tenant_partnerships(tenant_a_id, status, updated_at desc);
create index if not exists tenant_partnerships_b_idx
  on swisscompact.tenant_partnerships(tenant_b_id, status, updated_at desc);

create table if not exists swisscompact.tenant_partner_content_offers (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references swisscompact.tenant_partnerships(id) on delete cascade,
  sender_tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  recipient_tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  source_content_id uuid not null references swisscompact.tenant_content(id) on delete cascade,
  recipient_content_id uuid references swisscompact.tenant_content(id) on delete set null,
  title_snapshot text not null,
  message text,
  proposed_starts_at timestamptz,
  proposed_ends_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','withdrawn','expired')),
  created_by uuid references auth.users(id) on delete set null,
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_tenant_id <> recipient_tenant_id),
  check (proposed_ends_at is null or proposed_starts_at is null or proposed_ends_at > proposed_starts_at)
);
create index if not exists tenant_partner_offers_sender_idx
  on swisscompact.tenant_partner_content_offers(sender_tenant_id, status, updated_at desc);
create index if not exists tenant_partner_offers_recipient_idx
  on swisscompact.tenant_partner_content_offers(recipient_tenant_id, status, updated_at desc);
create unique index if not exists tenant_partner_offers_one_pending_idx
  on swisscompact.tenant_partner_content_offers(partnership_id, sender_tenant_id, recipient_tenant_id, source_content_id)
  where status = 'pending';

create or replace function swisscompact.validate_partner_network_scope()
returns trigger
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  partnership swisscompact.tenant_partnerships%rowtype;
begin
  select * into partnership
  from swisscompact.tenant_partnerships
  where id = new.partnership_id;

  if partnership.id is null or partnership.status <> 'active' then
    raise exception 'Die Partnerschaft ist nicht aktiv';
  end if;
  if not (
    (new.sender_tenant_id = partnership.tenant_a_id and new.recipient_tenant_id = partnership.tenant_b_id)
    or
    (new.sender_tenant_id = partnership.tenant_b_id and new.recipient_tenant_id = partnership.tenant_a_id)
  ) then
    raise exception 'Anbieter und Empfänger gehören nicht zu dieser Partnerschaft';
  end if;
  if tg_op = 'INSERT'
    or new.source_content_id is distinct from old.source_content_id
    or (new.status = 'accepted' and old.status is distinct from 'accepted') then
    if not exists (
      select 1 from swisscompact.tenant_content content
      where content.id = new.source_content_id
        and content.tenant_id = new.sender_tenant_id
        and content.status in ('approved','published')
    ) then
      raise exception 'Der angebotene Inhalt ist nicht freigegeben';
    end if;
  end if;
  if new.recipient_content_id is not null and not exists (
    select 1 from swisscompact.tenant_content content
    where content.id = new.recipient_content_id
      and content.tenant_id = new.recipient_tenant_id
  ) then
    raise exception 'Die übernommene Kopie gehört nicht zum Empfänger';
  end if;
  return new;
end;
$$;

drop trigger if exists tenant_partner_content_offers_validate_scope
  on swisscompact.tenant_partner_content_offers;
create trigger tenant_partner_content_offers_validate_scope
before insert or update on swisscompact.tenant_partner_content_offers
for each row execute function swisscompact.validate_partner_network_scope();

create or replace function swisscompact.protect_shared_partner_content()
returns trigger
language plpgsql
security definer
set search_path = swisscompact, public
as $$
begin
  if exists (
    select 1
    from swisscompact.tenant_partner_content_offers offer
    where offer.source_content_id = old.id
      and offer.status = 'accepted'
      and offer.recipient_content_id is not null
  ) then
    raise exception 'Dieser Inhalt wird noch von einem Partnerbetrieb verwendet';
  end if;
  return old;
end;
$$;

drop trigger if exists tenant_content_protect_partner_shares on swisscompact.tenant_content;
create trigger tenant_content_protect_partner_shares
before delete on swisscompact.tenant_content
for each row execute function swisscompact.protect_shared_partner_content();

alter table swisscompact.tenant_partnerships enable row level security;
alter table swisscompact.tenant_partner_content_offers enable row level security;

drop policy if exists tenant_partnerships_read on swisscompact.tenant_partnerships;
create policy tenant_partnerships_read on swisscompact.tenant_partnerships for select
using (
  swisscompact.is_tenant_member(tenant_a_id)
  or swisscompact.is_tenant_member(tenant_b_id)
);

drop policy if exists tenant_partner_content_offers_read on swisscompact.tenant_partner_content_offers;
create policy tenant_partner_content_offers_read on swisscompact.tenant_partner_content_offers for select
using (
  swisscompact.is_tenant_member(sender_tenant_id)
  or swisscompact.is_tenant_member(recipient_tenant_id)
);

revoke all on function swisscompact.validate_partner_network_scope(),
  swisscompact.protect_shared_partner_content() from public, anon, authenticated;
grant select on swisscompact.tenant_partnerships,
  swisscompact.tenant_partner_content_offers to authenticated, service_role;
grant insert, update, delete on swisscompact.tenant_partnerships,
  swisscompact.tenant_partner_content_offers to service_role;

commit;
