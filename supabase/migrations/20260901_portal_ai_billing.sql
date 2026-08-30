-- Mandantenfähige KI-Bildgenerierung mit inkludierten und via Stripe gekauften Credits.
alter table swisscompact.subscription_packages
  add column if not exists included_ai_credits integer not null default 0 check (included_ai_credits >= 0);
update swisscompact.subscription_packages set included_ai_credits = case code
  when 'essential' then 10
  when 'business' then 30
  when 'enterprise' then 100
  else included_ai_credits
end;

create table if not exists swisscompact.tenant_ai_credit_accounts (
  tenant_id uuid primary key references swisscompact.tenants(id) on delete cascade,
  included_remaining integer not null default 0 check (included_remaining >= 0),
  purchased_balance integer not null default 0 check (purchased_balance >= 0),
  period_start date not null default date_trunc('month', current_date)::date,
  period_end date not null default (date_trunc('month', current_date) + interval '1 month')::date,
  updated_at timestamptz not null default now()
);

create table if not exists swisscompact.tenant_ai_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  idempotency_key uuid not null,
  title text not null,
  prompt text not null,
  model text not null,
  quality text not null check (quality in ('low','medium','high')),
  size text not null,
  credit_cost integer not null check (credit_cost > 0),
  configuration jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','moderation_blocked')),
  content_id uuid references swisscompact.tenant_content(id) on delete set null,
  asset_path text,
  provider_request_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (tenant_id, idempotency_key)
);
create index if not exists tenant_ai_generation_jobs_recent_idx
  on swisscompact.tenant_ai_generation_jobs(tenant_id, created_at desc);

create table if not exists swisscompact.tenant_ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  kind text not null check (kind in ('generation','generation_refund','stripe_purchase','manual_adjustment')),
  included_delta integer not null default 0,
  purchased_delta integer not null default 0,
  generation_job_id uuid references swisscompact.tenant_ai_generation_jobs(id) on delete set null,
  stripe_purchase_id uuid,
  description text,
  created_at timestamptz not null default now(),
  check (included_delta <> 0 or purchased_delta <> 0)
);
create unique index if not exists tenant_ai_credit_ledger_generation_unique
  on swisscompact.tenant_ai_credit_ledger(generation_job_id, kind)
  where generation_job_id is not null;

create table if not exists swisscompact.tenant_stripe_customers (
  tenant_id uuid primary key references swisscompact.tenants(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists swisscompact.tenant_ai_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  package_code text not null,
  credits integer not null check (credits > 0),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'chf',
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  status text not null default 'pending' check (status in ('pending','paid','expired','refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenant_ai_credit_ledger_purchase_fk'
      and conrelid = 'swisscompact.tenant_ai_credit_ledger'::regclass
  ) then
    alter table swisscompact.tenant_ai_credit_ledger
      add constraint tenant_ai_credit_ledger_purchase_fk
      foreign key (stripe_purchase_id) references swisscompact.tenant_ai_credit_purchases(id) on delete set null;
  end if;
end;
$$;
create unique index if not exists tenant_ai_credit_ledger_purchase_unique
  on swisscompact.tenant_ai_credit_ledger(stripe_purchase_id, kind)
  where stripe_purchase_id is not null;

create table if not exists swisscompact.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

alter table swisscompact.tenant_ai_credit_accounts enable row level security;
alter table swisscompact.tenant_ai_generation_jobs enable row level security;
alter table swisscompact.tenant_ai_credit_ledger enable row level security;
alter table swisscompact.tenant_stripe_customers enable row level security;
alter table swisscompact.tenant_ai_credit_purchases enable row level security;
alter table swisscompact.stripe_webhook_events enable row level security;

drop policy if exists tenant_ai_credit_accounts_read on swisscompact.tenant_ai_credit_accounts;
create policy tenant_ai_credit_accounts_read on swisscompact.tenant_ai_credit_accounts
for select using (swisscompact.is_tenant_member(tenant_id));

drop policy if exists tenant_ai_generation_jobs_read on swisscompact.tenant_ai_generation_jobs;
create policy tenant_ai_generation_jobs_read on swisscompact.tenant_ai_generation_jobs
for select using (swisscompact.is_tenant_member(tenant_id));

drop policy if exists tenant_ai_credit_ledger_read on swisscompact.tenant_ai_credit_ledger;
create policy tenant_ai_credit_ledger_read on swisscompact.tenant_ai_credit_ledger
for select using (swisscompact.is_tenant_member(tenant_id));

drop policy if exists tenant_ai_credit_purchases_read on swisscompact.tenant_ai_credit_purchases;
create policy tenant_ai_credit_purchases_read on swisscompact.tenant_ai_credit_purchases
for select using (swisscompact.is_tenant_member(tenant_id));

create or replace function swisscompact.refresh_ai_credit_account(target_tenant uuid)
returns void language plpgsql security definer set search_path = swisscompact, public as $$
declare included_credits integer;
begin
  select greatest(0, floor(coalesce(s.included_ai_credits, p.included_ai_credits, 0)))::integer into included_credits
  from swisscompact.tenant_subscriptions s
  left join swisscompact.subscription_packages p on p.code = s.package_code
  where s.tenant_id = target_tenant and s.status in ('trial','active')
  order by s.created_at desc limit 1;
  included_credits := coalesce(included_credits, 0);

  insert into swisscompact.tenant_ai_credit_accounts
    (tenant_id, included_remaining, period_start, period_end)
  values
    (target_tenant, included_credits, date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month')::date)
  on conflict (tenant_id) do nothing;

  update swisscompact.tenant_ai_credit_accounts
  set included_remaining = included_credits,
      period_start = date_trunc('month', current_date)::date,
      period_end = (date_trunc('month', current_date) + interval '1 month')::date,
      updated_at = now()
  where tenant_id = target_tenant and current_date >= period_end;
end;
$$;

create or replace function swisscompact.get_ai_credit_balance(target_tenant uuid)
returns table(included_remaining integer, purchased_balance integer, available integer, period_end date)
language plpgsql security definer set search_path = swisscompact, public as $$
begin
  if not swisscompact.is_tenant_member(target_tenant) then raise exception 'Zugriff verweigert'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_tenant::text, 0));
  perform swisscompact.refresh_ai_credit_account(target_tenant);
  return query select a.included_remaining, a.purchased_balance,
    a.included_remaining + a.purchased_balance, a.period_end
  from swisscompact.tenant_ai_credit_accounts a where a.tenant_id = target_tenant;
end;
$$;

create or replace function swisscompact.reserve_ai_credits(target_tenant uuid, target_job uuid, requested_credits integer)
returns table(included_remaining integer, purchased_balance integer, available integer)
language plpgsql security definer set search_path = swisscompact, public as $$
declare account swisscompact.tenant_ai_credit_accounts%rowtype;
declare use_included integer;
declare use_purchased integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Nur Servicezugriff'; end if;
  if requested_credits <= 0 then raise exception 'Ungültige Credit-Anzahl'; end if;
  if not exists (select 1 from swisscompact.tenant_ai_generation_jobs j where j.id = target_job and j.tenant_id = target_tenant) then raise exception 'Generierungsauftrag fehlt'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_tenant::text, 0));
  perform swisscompact.refresh_ai_credit_account(target_tenant);
  select * into account from swisscompact.tenant_ai_credit_accounts a where a.tenant_id = target_tenant for update;

  if exists (select 1 from swisscompact.tenant_ai_credit_ledger l where l.generation_job_id = target_job and l.kind = 'generation') then
    return query select account.included_remaining, account.purchased_balance, account.included_remaining + account.purchased_balance;
    return;
  end if;
  if account.included_remaining + account.purchased_balance < requested_credits then
    raise exception using message = 'Nicht genügend KI-Credits', errcode = 'P0001';
  end if;

  use_included := least(account.included_remaining, requested_credits);
  use_purchased := requested_credits - use_included;
  update swisscompact.tenant_ai_credit_accounts a set
    included_remaining = a.included_remaining - use_included,
    purchased_balance = a.purchased_balance - use_purchased,
    updated_at = now()
  where a.tenant_id = target_tenant
  returning * into account;
  insert into swisscompact.tenant_ai_credit_ledger
    (tenant_id, kind, included_delta, purchased_delta, generation_job_id, description)
  values (target_tenant, 'generation', -use_included, -use_purchased, target_job, 'KI-Bildgenerierung');
  return query select account.included_remaining, account.purchased_balance, account.included_remaining + account.purchased_balance;
end;
$$;

create or replace function swisscompact.refund_ai_credits(target_tenant uuid, target_job uuid)
returns void language plpgsql security definer set search_path = swisscompact, public as $$
declare debit swisscompact.tenant_ai_credit_ledger%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Nur Servicezugriff'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_tenant::text, 0));
  if exists (select 1 from swisscompact.tenant_ai_credit_ledger where generation_job_id = target_job and kind = 'generation_refund') then return; end if;
  select * into debit from swisscompact.tenant_ai_credit_ledger
  where generation_job_id = target_job and kind = 'generation' for update;
  if debit.id is null then return; end if;
  update swisscompact.tenant_ai_credit_accounts set
    included_remaining = included_remaining - debit.included_delta,
    purchased_balance = purchased_balance - debit.purchased_delta,
    updated_at = now()
  where tenant_id = target_tenant;
  insert into swisscompact.tenant_ai_credit_ledger
    (tenant_id, kind, included_delta, purchased_delta, generation_job_id, description)
  values (target_tenant, 'generation_refund', -debit.included_delta, -debit.purchased_delta, target_job, 'Rückerstattung fehlgeschlagene Generierung');
end;
$$;

create or replace function swisscompact.grant_ai_credit_purchase(target_purchase uuid, payment_intent text)
returns void language plpgsql security definer set search_path = swisscompact, public as $$
declare purchase swisscompact.tenant_ai_credit_purchases%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Nur Servicezugriff'; end if;
  select * into purchase from swisscompact.tenant_ai_credit_purchases where id = target_purchase for update;
  if purchase.id is null then raise exception 'Credit-Kauf nicht gefunden'; end if;
  if purchase.status = 'paid' then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(purchase.tenant_id::text, 0));
  perform swisscompact.refresh_ai_credit_account(purchase.tenant_id);
  update swisscompact.tenant_ai_credit_accounts set purchased_balance = purchased_balance + purchase.credits, updated_at = now()
  where tenant_id = purchase.tenant_id;
  update swisscompact.tenant_ai_credit_purchases set status = 'paid', stripe_payment_intent_id = payment_intent, paid_at = now()
  where id = purchase.id;
  insert into swisscompact.tenant_ai_credit_ledger
    (tenant_id, kind, purchased_delta, stripe_purchase_id, description)
  values (purchase.tenant_id, 'stripe_purchase', purchase.credits, purchase.id, 'Stripe Credit-Paket');
end;
$$;

grant select on swisscompact.tenant_ai_credit_accounts, swisscompact.tenant_ai_generation_jobs,
  swisscompact.tenant_ai_credit_ledger, swisscompact.tenant_ai_credit_purchases to authenticated, service_role;
grant insert, update on swisscompact.tenant_ai_generation_jobs to service_role;
grant insert, update on swisscompact.tenant_ai_credit_purchases to service_role;
grant select, insert, update on swisscompact.tenant_stripe_customers, swisscompact.stripe_webhook_events to service_role;
revoke all on function swisscompact.get_ai_credit_balance(uuid),
  swisscompact.reserve_ai_credits(uuid, uuid, integer), swisscompact.refund_ai_credits(uuid, uuid),
  swisscompact.grant_ai_credit_purchase(uuid, text), swisscompact.refresh_ai_credit_account(uuid)
  from public, anon, authenticated;
grant execute on function swisscompact.get_ai_credit_balance(uuid),
  swisscompact.reserve_ai_credits(uuid, uuid, integer), swisscompact.refund_ai_credits(uuid, uuid) to service_role;
grant execute on function swisscompact.get_ai_credit_balance(uuid) to authenticated;
grant execute on function swisscompact.grant_ai_credit_purchase(uuid, text) to service_role;
grant execute on function swisscompact.refresh_ai_credit_account(uuid) to service_role;
