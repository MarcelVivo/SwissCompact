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

-- Ein überschaubares Punktelimit verhindert einseitige Dauernutzung. Der
-- Einladende schlägt das Limit vor, der Partner akzeptiert es mit der Einladung.
alter table swisscompact.tenant_partnerships
  add column if not exists barter_credit_limit_points numeric(12,2) not null default 300
    check (barter_credit_limit_points between 10 and 100000);

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

-- 1 Werbepunkt entspricht einem Bildschirmtag mit 10 % Playlist-Anteil.
-- Dadurch sind z. B. 1 Bildschirm zu 100 % und 10 Bildschirme zu 10 % fair
-- vergleichbar. Geld wird nur dokumentiert, nicht über SwissCompact eingezogen.
alter table swisscompact.tenant_partner_content_offers
  add column if not exists settlement_mode text not null default 'barter'
    check (settlement_mode in ('barter','paid','hybrid','courtesy')),
  add column if not exists requested_display_count integer not null default 1
    check (requested_display_count between 1 and 10000),
  add column if not exists playlist_share_percent numeric(5,2) not null default 10
    check (playlist_share_percent between 1 and 100),
  add column if not exists delivery_value_points numeric(12,2) not null default 1
    check (delivery_value_points > 0),
  add column if not exists barter_value_points numeric(12,2) not null default 0
    check (barter_value_points >= 0),
  add column if not exists cash_amount_chf numeric(12,2) not null default 0
    check (cash_amount_chf >= 0),
  add column if not exists cash_status text not null default 'not_applicable'
    check (cash_status in ('not_applicable','agreed','received','cancelled')),
  add column if not exists delivery_status text not null default 'proposed'
    check (delivery_status in ('proposed','planned','host_confirmed','confirmed','disputed','cancelled')),
  add column if not exists host_confirmed_at timestamptz,
  add column if not exists advertiser_confirmed_at timestamptz;

create or replace function swisscompact.validate_partner_network_scope()
returns trigger
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  partnership swisscompact.tenant_partnerships%rowtype;
  expected_points numeric(12,2);
begin
  select * into partnership
  from swisscompact.tenant_partnerships
  where id = new.partnership_id;

  if partnership.id is null then
    raise exception 'Die Partnerschaft wurde nicht gefunden';
  end if;
  if partnership.status <> 'active' and (tg_op = 'INSERT' or new.status = 'pending') then
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

  if new.proposed_starts_at is null or new.proposed_ends_at is null then
    raise exception 'Für Partnerwerbung sind Start und Ende erforderlich';
  end if;
  expected_points := round((
    new.requested_display_count
    * greatest(1, ceil(extract(epoch from (new.proposed_ends_at - new.proposed_starts_at)) / 86400))
    * new.playlist_share_percent / 10
  )::numeric, 2);
  if abs(new.delivery_value_points - expected_points) > 0.01 then
    raise exception 'Der Werbewert wurde nicht korrekt berechnet';
  end if;
  if new.barter_value_points > new.delivery_value_points then
    raise exception 'Tauschpunkte dürfen den Werbewert nicht übersteigen';
  end if;
  if new.settlement_mode = 'barter' and (new.barter_value_points <> new.delivery_value_points or new.cash_amount_chf <> 0) then
    raise exception 'Beim Werbetausch muss der gesamte Werbewert ausgeglichen werden';
  elsif new.settlement_mode = 'paid' and (new.barter_value_points <> 0 or new.cash_amount_chf <= 0) then
    raise exception 'Bezahlte Werbung benötigt einen vereinbarten CHF-Betrag';
  elsif new.settlement_mode = 'hybrid' and (new.barter_value_points <= 0 or new.barter_value_points >= new.delivery_value_points or new.cash_amount_chf <= 0) then
    raise exception 'Die Mischform benötigt Tauschpunkte und einen CHF-Ausgleich';
  elsif new.settlement_mode = 'courtesy' and (new.barter_value_points <> 0 or new.cash_amount_chf <> 0) then
    raise exception 'Kostenlose Unterstützung darf keine Gegenleistung enthalten';
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
