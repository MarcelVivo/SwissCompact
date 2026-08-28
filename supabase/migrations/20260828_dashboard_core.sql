create extension if not exists pgcrypto;
create schema if not exists swisscompact;

create table if not exists swisscompact.dashboard_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null check (role in ('owner_admin', 'admin', 'staff', 'advisor', 'client')),
  security_admin boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function swisscompact.is_dashboard_admin()
returns boolean
language sql
stable
security definer
set search_path = swisscompact, public
as $$
  select exists (
    select 1 from swisscompact.dashboard_profiles
    where user_id = auth.uid() and active and role in ('owner_admin', 'admin')
  );
$$;

create or replace function swisscompact.is_security_admin()
returns boolean
language sql
stable
security definer
set search_path = swisscompact, public
as $$
  select exists (
    select 1 from swisscompact.dashboard_profiles
    where user_id = auth.uid() and active and role = 'owner_admin' and security_admin
  );
$$;

create table if not exists swisscompact.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  previous_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists swisscompact.clients (
  id uuid primary key default gen_random_uuid(),
  customer_number text unique,
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  address_line text,
  postal_code text,
  city text,
  country_code text not null default 'CH',
  lifecycle text not null default 'lead' check (lifecycle in ('lead','prospect','customer','inactive')),
  marketing_consent boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists swisscompact.customer_number_seq start 1;
create or replace function swisscompact.assign_customer_number()
returns trigger language plpgsql set search_path = swisscompact, public as $$
begin
  if new.customer_number is null then
    new.customer_number := 'K-' || lpad(nextval('swisscompact.customer_number_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists clients_assign_number on swisscompact.clients;
create trigger clients_assign_number before insert on swisscompact.clients
for each row execute function swisscompact.assign_customer_number();

create table if not exists swisscompact.opportunities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references swisscompact.clients(id) on delete set null,
  title text not null,
  stage text not null default 'request' check (stage in (
    'request','qualification','consulting','customer_decision','quote','confirmed',
    'deposit_50','planning','hardware_concept','software_development','procurement',
    'installation','installation_30','configuration','acceptance','final_invoice_20',
    'completed','maintenance','paused','lost','cancelled'
  )),
  owner_area text not null default 'shared' check (owner_area in ('marcel','thomas','shared','ai')),
  value_chf numeric(12,2) not null default 0,
  probability integer not null default 20 check (probability between 0 and 100),
  expected_close date,
  next_action text,
  next_action_at timestamptz,
  source text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists swisscompact.projects (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references swisscompact.opportunities(id) on delete set null,
  client_id uuid references swisscompact.clients(id) on delete restrict,
  order_number text unique,
  title text not null,
  status text not null default 'planning' check (status in ('planning','active','blocked','acceptance','completed','cancelled')),
  software_owner uuid references auth.users(id) on delete set null,
  hardware_owner uuid references auth.users(id) on delete set null,
  starts_on date,
  target_completion date,
  payment_plan jsonb not null default '{"deposit":50,"installation":30,"acceptance":20}'::jsonb,
  deposit_received boolean not null default false,
  installation_payment_received boolean not null default false,
  final_payment_received boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists swisscompact.order_number_seq start 1;
create or replace function swisscompact.assign_order_number()
returns trigger language plpgsql set search_path = swisscompact, public as $$
begin
  if new.order_number is null then
    new.order_number := 'AUF-' || extract(year from current_date)::int || '-' || lpad(nextval('swisscompact.order_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists projects_assign_number on swisscompact.projects;
create trigger projects_assign_number before insert on swisscompact.projects
for each row execute function swisscompact.assign_order_number();

create table if not exists swisscompact.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references swisscompact.projects(id) on delete cascade,
  opportunity_id uuid references swisscompact.opportunities(id) on delete cascade,
  title text not null,
  description text,
  responsibility text not null default 'shared' check (responsibility in ('marcel','thomas','shared','ai')),
  assignee_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open','in_progress','waiting','done','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists swisscompact.approvals (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  content_hash text not null,
  requested_by uuid references auth.users(id) on delete set null,
  marcel_approved_at timestamptz,
  thomas_approved_at timestamptz,
  invalidated_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(entity_type, entity_id, action, content_hash)
);

create table if not exists swisscompact.quotes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references swisscompact.clients(id) on delete restrict,
  opportunity_id uuid references swisscompact.opportunities(id) on delete set null,
  quote_number text unique,
  status text not null default 'draft' check (status in ('draft','approval','sent','viewed','accepted','declined','expired')),
  currency text not null default 'CHF' check (currency = 'CHF'),
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  valid_until date,
  items jsonb not null default '[]'::jsonb,
  terms text,
  immutable_pdf_path text,
  document_hash text,
  accepted_by_name text,
  accepted_by_email text,
  accepted_at timestamptz,
  acceptance_ip inet,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists swisscompact.quote_number_seq start 1;
create or replace function swisscompact.assign_quote_number()
returns trigger language plpgsql set search_path = swisscompact, public as $$
begin
  if new.quote_number is null then
    new.quote_number := 'OFF-' || extract(year from current_date)::int || '-' || lpad(nextval('swisscompact.quote_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists quotes_assign_number on swisscompact.quotes;
create trigger quotes_assign_number before insert on swisscompact.quotes
for each row execute function swisscompact.assign_quote_number();

create table if not exists swisscompact.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references swisscompact.clients(id) on delete restrict,
  project_id uuid references swisscompact.projects(id) on delete set null,
  invoice_number text unique,
  installment text check (installment in ('deposit_50','installation_30','acceptance_20','subscription','other')),
  status text not null default 'draft' check (status in ('draft','approval','sent','partially_paid','paid','overdue','cancelled','credited')),
  amount numeric(12,2) not null,
  currency text not null default 'CHF' check (currency = 'CHF'),
  issued_on date,
  due_on date,
  paid_at timestamptz,
  qr_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists swisscompact.invoice_number_seq start 1;
create or replace function swisscompact.assign_invoice_number()
returns trigger language plpgsql set search_path = swisscompact, public as $$
begin
  if new.invoice_number is null then
    new.invoice_number := 'RE-' || extract(year from current_date)::int || '-' || lpad(nextval('swisscompact.invoice_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists invoices_assign_number on swisscompact.invoices;
create trigger invoices_assign_number before insert on swisscompact.invoices
for each row execute function swisscompact.assign_invoice_number();

create table if not exists swisscompact.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','revenue','expense')),
  owner_scope text check (owner_scope in ('marcel','thomas','company')),
  active boolean not null default true
);

create table if not exists swisscompact.journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  reference text,
  description text not null,
  status text not null default 'draft' check (status in ('draft','approval','posted','reversed')),
  source text not null default 'manual' check (source in ('manual','receipt','invoice','bank_import','owner_settlement','ai')),
  receipt_path text,
  corrected_entry_id uuid references swisscompact.journal_entries(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists swisscompact.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references swisscompact.journal_entries(id) on delete cascade,
  account_id uuid not null references swisscompact.ledger_accounts(id) on delete restrict,
  debit numeric(12,2) not null default 0 check (debit >= 0),
  credit numeric(12,2) not null default 0 check (credit >= 0),
  check ((debit = 0) <> (credit = 0))
);

create or replace function swisscompact.validate_balanced_entry()
returns trigger language plpgsql set search_path = swisscompact, public as $$
declare balance numeric(12,2);
begin
  if new.status = 'posted' and old.status is distinct from 'posted' then
    select coalesce(sum(debit-credit),0) into balance from swisscompact.journal_lines where entry_id = new.id;
    if balance <> 0 then raise exception 'Journal entry must balance before posting'; end if;
    new.posted_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists journal_entries_balance on swisscompact.journal_entries;
create trigger journal_entries_balance before update on swisscompact.journal_entries
for each row execute function swisscompact.validate_balanced_entry();

create table if not exists swisscompact.founder_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null,
  transaction_type text not null check (transaction_type in ('company_expense','settlement_transfer','capital_contribution','repayment')),
  paid_by text not null check (paid_by in ('marcel','thomas')),
  received_by text check (received_by in ('marcel','thomas','company')),
  amount_chf numeric(12,2) not null check (amount_chf > 0),
  category text,
  description text not null,
  receipt_path text,
  status text not null default 'pending_receipt' check (status in ('pending_receipt','approval','confirmed','booked','corrected')),
  created_at timestamptz not null default now()
);

insert into swisscompact.founder_transactions
  (transaction_date, transaction_type, paid_by, received_by, amount_chf, description, status)
select date '2026-08-05', 'company_expense', 'marcel', 'company', 600, 'Vorgründungsauslagen SwissCompact; Kategorie und Beleg werden im Dashboard ergänzt.', 'pending_receipt'
where not exists (
  select 1 from swisscompact.founder_transactions
  where transaction_date = date '2026-08-05' and paid_by = 'marcel' and amount_chf = 600
);

insert into swisscompact.founder_transactions
  (transaction_date, transaction_type, paid_by, received_by, amount_chf, description, status)
select date '2026-08-28', 'settlement_transfer', 'thomas', 'marcel', 300, 'Ausgleich Vorgründungsauslagen; wirtschaftliche Belastung danach je CHF 300.', 'confirmed'
where not exists (
  select 1 from swisscompact.founder_transactions
  where transaction_date = date '2026-08-28' and paid_by = 'thomas' and amount_chf = 300
);

create table if not exists swisscompact.owner_settlements (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  marcel_total numeric(12,2) not null default 0,
  thomas_total numeric(12,2) not null default 0,
  transfer_from text check (transfer_from in ('marcel','thomas')),
  transfer_amount numeric(12,2) not null default 0,
  marcel_confirmed_at timestamptz,
  thomas_confirmed_at timestamptz,
  booked_at timestamptz,
  unique(period_start, period_end)
);

create table if not exists swisscompact.subscription_packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  monthly_base_chf numeric(12,2),
  monthly_location_chf numeric(12,2),
  monthly_display_chf numeric(12,2),
  minimum_months integer not null default 12,
  included_services jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into swisscompact.subscription_packages (code, name, included_services)
values
  ('essential','Essential','["Hosting","Updates","Wartung","Bugbehandlung","Kleine Reparaturen"]'::jsonb),
  ('business','Business','["Mehrere Standorte","Monitoring","Vorlagen","Priorisierter Support"]'::jsonb),
  ('enterprise','Enterprise','["Individuelle Skalierung","Integrationen","SLA","Persönliche Betreuung"]'::jsonb)
on conflict (code) do nothing;

create table if not exists swisscompact.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  bot text not null check (bot in ('lead','consulting','quote','project','finance','dunning','retention','marketing')),
  action text not null,
  status text not null default 'queued' check (status in ('queued','running','approval','completed','failed','cancelled','budget_blocked')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  estimated_cost_chf numeric(10,4),
  actual_cost_chf numeric(10,4),
  requires_dual_approval boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists swisscompact.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null check (channel in ('linkedin','instagram','facebook','google_ads','newsletter','website')),
  status text not null default 'draft' check (status in ('draft','approval','approved','scheduled','active','paused','completed')),
  monthly_plan_id uuid,
  budget_chf numeric(12,2) not null default 0,
  content jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists swisscompact.system_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into swisscompact.system_settings (key, value) values
  ('ai_budget', '{"monthlyLimitChf":100,"warningAtChf":70,"hardStop":true}'::jsonb),
  ('vat_monitoring', '{"registered":false,"warningAtChf":80000,"urgentAtChf":95000,"thresholdChf":100000}'::jsonb),
  ('accounting', '{"preOpeningFrom":"2026-08-05","firstFiscalYearFrom":"2027-01-01","currency":"CHF","method":"double_entry"}'::jsonb),
  ('payment_plan', '{"depositPercent":50,"installationPercent":30,"acceptancePercent":20,"dueDays":14}'::jsonb),
  ('company_draft', '{"legalStatus":"pre_founding","plannedLegalForm":"Kollektivgesellschaft","plannedFormation":"2027-01-01","address":"Schwarzenburgstrasse 65, 3008 Bern","temporaryInvoiceIssuer":"Marcel Spahr"}'::jsonb)
on conflict (key) do nothing;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'clients','opportunities','projects','tasks','approvals',
    'quotes','invoices','ledger_accounts','journal_entries','journal_lines','founder_transactions',
    'owner_settlements','subscription_packages','ai_jobs','marketing_campaigns','system_settings'
  ] loop
    execute format('alter table swisscompact.%I enable row level security', table_name);
    execute format('drop policy if exists dashboard_admin_all on swisscompact.%I', table_name);
    execute format(
      'create policy dashboard_admin_all on swisscompact.%I for all using (swisscompact.is_dashboard_admin()) with check (swisscompact.is_dashboard_admin())',
      table_name
    );
  end loop;
end $$;

alter table swisscompact.dashboard_profiles enable row level security;
drop policy if exists dashboard_profiles_read on swisscompact.dashboard_profiles;
drop policy if exists dashboard_profiles_security_write on swisscompact.dashboard_profiles;
create policy dashboard_profiles_read on swisscompact.dashboard_profiles
for select using (swisscompact.is_dashboard_admin());
create policy dashboard_profiles_security_write on swisscompact.dashboard_profiles
for all using (swisscompact.is_security_admin()) with check (swisscompact.is_security_admin());

alter table swisscompact.audit_log enable row level security;
drop policy if exists audit_log_read on swisscompact.audit_log;
drop policy if exists audit_log_append on swisscompact.audit_log;
create policy audit_log_read on swisscompact.audit_log
for select using (swisscompact.is_dashboard_admin());
create policy audit_log_append on swisscompact.audit_log
for insert with check (swisscompact.is_dashboard_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('swisscompact-documents', 'swisscompact-documents', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp','text/csv','application/xml'])
on conflict (id) do nothing;

drop policy if exists dashboard_documents_admin on storage.objects;
create policy dashboard_documents_admin on storage.objects
for all using (bucket_id = 'swisscompact-documents' and swisscompact.is_dashboard_admin())
with check (bucket_id = 'swisscompact-documents' and swisscompact.is_dashboard_admin());

insert into swisscompact.ledger_accounts (code, name, account_type, owner_scope) values
  ('1000','Hauptkonto','asset','company'),
  ('1100','Forderungen Kunden','asset','company'),
  ('2000','Verbindlichkeiten','liability','company'),
  ('2450-M','Darlehen Marcel Spahr','liability','marcel'),
  ('2450-T','Darlehen Thomas Peter','liability','thomas'),
  ('3000','Projektumsatz','revenue','company'),
  ('3200','Software-Abonnements','revenue','company'),
  ('4000','Hardware und Material','expense','company'),
  ('4200','Montage und Fremdleistungen','expense','company'),
  ('6000','Marketing','expense','company'),
  ('6100','Software und Hosting','expense','company'),
  ('6900','Übriger Betriebsaufwand','expense','company')
on conflict (code) do nothing;

grant usage on schema swisscompact to authenticated, service_role;
grant select, insert, update, delete on all tables in schema swisscompact to authenticated, service_role;
grant usage, select on all sequences in schema swisscompact to authenticated, service_role;
grant execute on all functions in schema swisscompact to authenticated, service_role;

alter default privileges in schema swisscompact
grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema swisscompact
grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema swisscompact
grant execute on functions to authenticated, service_role;
grant all on all tables in schema swisscompact to service_role;
grant select, insert, update, delete on all tables in schema swisscompact to authenticated;
grant usage, select on all sequences in schema swisscompact to authenticated, service_role;
alter default privileges in schema swisscompact grant all on tables to service_role;
alter default privileges in schema swisscompact grant select, insert, update, delete on tables to authenticated;
