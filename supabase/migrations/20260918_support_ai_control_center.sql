-- KI-Support-Kontrollzentrum: Kosten, Qualität und Kundenfeedback.
begin;

alter table swisscompact.support_ai_runs
  add column if not exists input_tokens bigint not null default 0
    check (input_tokens >= 0),
  add column if not exists cached_input_tokens bigint not null default 0
    check (cached_input_tokens >= 0 and cached_input_tokens <= input_tokens),
  add column if not exists output_tokens bigint not null default 0
    check (output_tokens >= 0),
  add column if not exists total_tokens bigint not null default 0
    check (total_tokens >= 0),
  add column if not exists estimated_cost_usd numeric(14,8)
    check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(pricing_snapshot) = 'object');

create index if not exists support_ai_runs_control_center_idx
  on swisscompact.support_ai_runs(created_at desc, status);

create table if not exists swisscompact.support_ai_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references swisscompact.tenants(id) on delete cascade,
  ticket_id uuid not null references swisscompact.support_tickets(id) on delete cascade,
  message_id uuid not null references swisscompact.support_ticket_messages(id) on delete cascade,
  ai_run_id uuid references swisscompact.support_ai_runs(id) on delete set null,
  submitted_by uuid references auth.users(id) on delete set null,
  rating text not null check (rating in ('helpful','not_helpful')),
  comment text check (comment is null or char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists support_ai_feedback_user_message_idx
  on swisscompact.support_ai_feedback(message_id, submitted_by)
  where submitted_by is not null;
create index if not exists support_ai_feedback_control_center_idx
  on swisscompact.support_ai_feedback(created_at desc, rating);

create or replace function swisscompact.submit_support_ai_feedback(
  target_message uuid,
  target_rating text,
  target_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = swisscompact, public
as $$
declare
  support_message swisscompact.support_ticket_messages%rowtype;
  feedback_id uuid;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
  if target_rating not in ('helpful','not_helpful') then
    raise exception 'Ungültige Bewertung';
  end if;
  if target_comment is not null and char_length(trim(target_comment)) > 2000 then
    raise exception 'Der Hinweis ist zu lang';
  end if;

  select * into support_message
  from swisscompact.support_ticket_messages
  where id = target_message
    and generated_by_ai
    and visible_to_customer;
  if support_message.id is null
    or not swisscompact.is_tenant_member(support_message.tenant_id) then
    raise exception 'Diese KI-Antwort kann nicht bewertet werden';
  end if;

  insert into swisscompact.support_ai_feedback (
    tenant_id, ticket_id, message_id, ai_run_id, submitted_by, rating, comment
  ) values (
    support_message.tenant_id, support_message.ticket_id, support_message.id,
    support_message.ai_run_id, auth.uid(), target_rating, nullif(trim(target_comment), '')
  )
  on conflict (message_id, submitted_by) where submitted_by is not null do update
  set rating = excluded.rating,
      comment = excluded.comment,
      updated_at = now()
  returning id into feedback_id;

  return feedback_id;
end;
$$;

alter table swisscompact.support_ai_feedback enable row level security;

drop policy if exists support_ai_feedback_read on swisscompact.support_ai_feedback;
create policy support_ai_feedback_read
on swisscompact.support_ai_feedback for select
using (submitted_by = auth.uid() or swisscompact.is_dashboard_admin());

revoke all on function swisscompact.submit_support_ai_feedback(uuid,text,text)
  from public, anon;
grant execute on function swisscompact.submit_support_ai_feedback(uuid,text,text)
  to authenticated, service_role;
grant select on swisscompact.support_ai_feedback to authenticated, service_role;
grant insert, update, delete on swisscompact.support_ai_feedback to service_role;

commit;
