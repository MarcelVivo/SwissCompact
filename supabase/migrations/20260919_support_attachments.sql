-- Sichere Anhänge für den geführten Supportdialog.
begin;

create table if not exists swisscompact.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  ticket_id uuid not null references swisscompact.support_tickets(id) on delete cascade,
  message_id uuid references swisscompact.support_ticket_messages(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_type text not null check (uploaded_by_type in ('customer','support')),
  file_name text not null check (char_length(trim(file_name)) between 1 and 180),
  mime_type text not null
    check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  storage_path text not null unique check (char_length(storage_path) between 1 and 700),
  upload_status text not null default 'uploading'
    check (upload_status in ('uploading','ready','failed')),
  visible_to_customer boolean not null default true,
  ai_analysis_allowed boolean not null default false,
  ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (upload_status <> 'ready' or ready_at is not null)
);

create index if not exists support_ticket_attachments_ticket_idx
  on swisscompact.support_ticket_attachments(ticket_id, created_at);
create index if not exists support_ticket_attachments_message_idx
  on swisscompact.support_ticket_attachments(message_id, created_at)
  where message_id is not null;

create or replace function swisscompact.validate_support_attachment_scope()
returns trigger
language plpgsql
security definer
set search_path = swisscompact, public
as $$
begin
  if not exists (
    select 1
    from swisscompact.support_tickets ticket
    where ticket.id = new.ticket_id
      and ticket.tenant_id = new.tenant_id
  ) then
    raise exception 'Supportanhang und Ticket gehören nicht zusammen';
  end if;

  if new.message_id is not null and not exists (
    select 1
    from swisscompact.support_ticket_messages message
    where message.id = new.message_id
      and message.ticket_id = new.ticket_id
      and message.tenant_id = new.tenant_id
  ) then
    raise exception 'Supportanhang und Nachricht gehören nicht zusammen';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists support_ticket_attachments_validate_scope
  on swisscompact.support_ticket_attachments;
create trigger support_ticket_attachments_validate_scope
before insert or update on swisscompact.support_ticket_attachments
for each row execute function swisscompact.validate_support_attachment_scope();

alter table swisscompact.support_ticket_attachments enable row level security;

drop policy if exists support_ticket_attachments_read
  on swisscompact.support_ticket_attachments;
create policy support_ticket_attachments_read
on swisscompact.support_ticket_attachments for select
using (
  swisscompact.is_dashboard_admin()
  or (visible_to_customer and swisscompact.is_tenant_member(tenant_id))
);

revoke all on function swisscompact.validate_support_attachment_scope()
  from public, anon, authenticated;
grant select on swisscompact.support_ticket_attachments to authenticated, service_role;
grant insert, update, delete on swisscompact.support_ticket_attachments to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'swisscompact-support',
  'swisscompact-support',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;
