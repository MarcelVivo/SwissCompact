-- Sicherer KI-Erstsupport mit nachvollziehbarer Eskalation an das Supportteam.
begin;

alter table swisscompact.support_tickets
  add column if not exists ai_handling_status text not null default 'disabled'
    check (ai_handling_status in ('eligible','processing','waiting_customer','escalated','resolved','disabled')),
  add column if not exists ai_attempt_count integer not null default 0
    check (ai_attempt_count between 0 and 20),
  add column if not exists ai_confidence numeric(4,3)
    check (ai_confidence is null or ai_confidence between 0 and 1),
  add column if not exists ai_escalation_reason text
    check (ai_escalation_reason is null or char_length(ai_escalation_reason) <= 1000),
  add column if not exists ai_last_responded_at timestamptz,
  add column if not exists ai_escalated_at timestamptz,
  add column if not exists ai_disabled_at timestamptz,
  add column if not exists ai_disabled_by uuid references auth.users(id) on delete set null;

create index if not exists support_tickets_ai_queue_idx
  on swisscompact.support_tickets(ai_handling_status, ai_escalated_at desc)
  where ai_handling_status in ('eligible','processing','escalated');

create or replace function swisscompact.prepare_support_ai_ticket()
returns trigger
language plpgsql
security definer
set search_path = swisscompact, public
as $$
begin
  new.ai_attempt_count := 0;
  new.ai_confidence := null;
  new.ai_last_responded_at := null;
  new.ai_disabled_at := null;
  new.ai_disabled_by := null;

  if new.priority = 'critical' then
    new.ai_handling_status := 'escalated';
    new.ai_escalation_reason := 'Kritische Supportanfragen werden direkt durch das Supportteam bearbeitet.';
    new.ai_escalated_at := now();
  elsif new.category in ('billing','feature') then
    new.ai_handling_status := 'escalated';
    new.ai_escalation_reason := case new.category
      when 'billing' then 'Abonnement- und Rechnungsfragen werden direkt durch das Supportteam bearbeitet.'
      else 'Funktionswünsche werden durch das Supportteam geprüft.'
    end;
    new.ai_escalated_at := now();
  else
    new.ai_handling_status := 'eligible';
    new.ai_escalation_reason := null;
    new.ai_escalated_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_prepare_ai on swisscompact.support_tickets;
create trigger support_tickets_prepare_ai
before insert on swisscompact.support_tickets
for each row execute function swisscompact.prepare_support_ai_ticket();

create table if not exists swisscompact.support_ai_runs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references swisscompact.support_tickets(id) on delete cascade,
  trigger_key text not null unique check (char_length(trigger_key) between 1 and 180),
  trigger_message_id uuid references swisscompact.support_ticket_messages(id) on delete set null,
  status text not null default 'processing'
    check (status in ('processing','responded','resolved','escalated','failed','skipped')),
  model text check (model is null or char_length(model) <= 120),
  openai_response_id text check (openai_response_id is null or char_length(openai_response_id) <= 180),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  decision text check (decision is null or decision in ('reply','resolve','escalate')),
  escalation_reason text check (escalation_reason is null or char_length(escalation_reason) <= 1000),
  prompt_context jsonb not null default '{}'::jsonb check (jsonb_typeof(prompt_context) = 'object'),
  usage_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(usage_metadata) = 'object'),
  error_message text check (error_message is null or char_length(error_message) <= 2000),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists support_ai_runs_ticket_idx
  on swisscompact.support_ai_runs(ticket_id, created_at desc);
create index if not exists support_ai_runs_escalated_idx
  on swisscompact.support_ai_runs(status, created_at desc)
  where status in ('escalated','failed');

alter table swisscompact.support_ticket_messages
  add column if not exists generated_by_ai boolean not null default false,
  add column if not exists ai_run_id uuid references swisscompact.support_ai_runs(id) on delete set null;

create table if not exists swisscompact.support_ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'general'
    check (category in ('general','incident','question','training','content')),
  title text not null check (char_length(trim(title)) between 3 and 180),
  content text not null check (char_length(trim(content)) between 10 and 12000),
  source_reference text check (source_reference is null or char_length(source_reference) <= 500),
  active boolean not null default true,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, title),
  check (not active or approved_at is not null)
);
create index if not exists support_ai_knowledge_active_idx
  on swisscompact.support_ai_knowledge(category, updated_at desc)
  where active;

-- Ausschliesslich risikoarme, allgemein gültige Ersthilfen. Produktspezifische
-- Anleitungen werden später bewusst durch einen Admin freigegeben ergänzt.
insert into swisscompact.support_ai_knowledge (
  category, title, content, source_reference, active, approved_at
) values
  ('general', 'Sichere Klärung einer Supportanfrage',
   'Erfrage bei unklaren Meldungen höchstens: den genauen Wortlaut der Fehlermeldung, den Zeitpunkt des ersten Auftretens, ob alle oder nur einzelne Benutzer beziehungsweise Bildschirme betroffen sind und was bereits versucht wurde. Bitte bei Screenshots darum, persönliche Daten vorher unkenntlich zu machen. Frage niemals nach Passwörtern, Zugangscodes oder API-Schlüsseln.',
   'SwissCompact Supportstandard', true, now()),
  ('question', 'Risikoarme Portal-Ersthilfe',
   'Bei einem reinen Darstellungs- oder Bedienungsproblem darf empfohlen werden: Seite einmal vollständig neu laden, Abmeldung und erneute Anmeldung über den normalen Portalzugang, einen aktuellen unterstützten Browser verwenden und prüfen, ob das Verhalten in einem privaten Browserfenster ebenfalls auftritt. Keine Browser-Sicherheitsfunktionen deaktivieren und keine Zugangsdaten anfordern.',
   'SwissCompact Portalbetrieb', true, now()),
  ('incident', 'Sichere Eingrenzung einer Bildschirmstörung',
   'Ermittle zuerst, ob ein einzelner oder mehrere Bildschirme betroffen sind und ob das Portal beim Bildschirm eine Verbindung oder einen offenen Hinweis zeigt. Der Kunde darf sichtbare Strom- und Netzwerkkabel auf festen Sitz prüfen, ohne Geräte zu öffnen. Keine Arbeiten an Netzspannung, keine Demontage und kein Umgehen von Schutzmechanismen anweisen. Für alle weitergehenden Gerätearbeiten eskalieren.',
   'SwissCompact Betriebssicherheit', true, now()),
  ('content', 'Inhalts- und Kampagnenprüfung ohne Änderungen',
   'Bitte den Kunden im Portal zu prüfen, ob der Inhalt freigegeben, die Kampagne aktiv beziehungsweise für den gewünschten Zeitraum geplant und der richtige Bildschirm zugeordnet ist. Benenne nur Prüfschritte; behaupte nie, den Inhalt, die Kampagne oder die Zuordnung selbst geändert zu haben. Bei widersprüchlichen Zuständen oder notwendiger Korrektur an das Supportteam eskalieren.',
   'SwissCompact Kampagnenbetrieb', true, now())
on conflict (category, title) do nothing;

alter table swisscompact.support_ai_runs enable row level security;
alter table swisscompact.support_ai_knowledge enable row level security;

drop policy if exists support_ai_runs_admin_read on swisscompact.support_ai_runs;
create policy support_ai_runs_admin_read on swisscompact.support_ai_runs for select
using (swisscompact.is_dashboard_admin());

drop policy if exists support_ai_knowledge_admin_read on swisscompact.support_ai_knowledge;
create policy support_ai_knowledge_admin_read on swisscompact.support_ai_knowledge for select
using (swisscompact.is_dashboard_admin());

revoke all on function swisscompact.prepare_support_ai_ticket() from public, anon, authenticated;
grant select on swisscompact.support_ai_runs, swisscompact.support_ai_knowledge
  to authenticated, service_role;
grant insert, update, delete on swisscompact.support_ai_runs, swisscompact.support_ai_knowledge
  to service_role;

commit;
