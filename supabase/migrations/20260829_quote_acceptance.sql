-- Sichere Offertenannahme, Dokumentversionierung und automatische Anzahlungsrechnung.
alter table swisscompact.projects
  add column if not exists quote_id uuid references swisscompact.quotes(id) on delete set null;

create unique index if not exists projects_quote_id_unique
  on swisscompact.projects(quote_id) where quote_id is not null;

alter table swisscompact.invoices
  add column if not exists quote_id uuid references swisscompact.quotes(id) on delete set null,
  add column if not exists immutable_pdf_path text,
  add column if not exists document_hash text;

create unique index if not exists invoices_quote_installment_unique
  on swisscompact.invoices(quote_id, installment) where quote_id is not null;

create table if not exists swisscompact.quote_access_tokens (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references swisscompact.quotes(id) on delete cascade,
  token_hash text not null unique,
  recipient_email text not null,
  expires_at timestamptz not null,
  last_viewed_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists quote_access_tokens_quote_id_idx
  on swisscompact.quote_access_tokens(quote_id, created_at desc);

alter table swisscompact.quote_access_tokens enable row level security;
drop policy if exists dashboard_quote_tokens_admin on swisscompact.quote_access_tokens;
create policy dashboard_quote_tokens_admin on swisscompact.quote_access_tokens
for all using (swisscompact.is_dashboard_admin())
with check (swisscompact.is_dashboard_admin());

grant select, insert, update, delete on swisscompact.quote_access_tokens to authenticated, service_role;

