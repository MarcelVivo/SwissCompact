-- Persönliches Sicherheitscenter für Dashboard- und Portalbenutzer.
begin;

create table if not exists swisscompact.user_security_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references swisscompact.tenants(id) on delete cascade,
  session_hash text not null unique check (session_hash ~ '^[a-f0-9]{64}$'),
  audience text not null check (audience in ('dashboard','portal')),
  device_label text not null check (char_length(device_label) between 1 and 180),
  browser_name text not null default 'Unbekannter Browser',
  operating_system text not null default 'Unbekanntes System',
  user_agent text not null default '' check (char_length(user_agent) <= 1000),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (
    (audience = 'dashboard' and tenant_id is null)
    or (audience = 'portal' and tenant_id is not null)
  )
);

create index if not exists user_security_sessions_user_recent_idx
  on swisscompact.user_security_sessions(user_id, last_seen_at desc);
create index if not exists user_security_sessions_active_idx
  on swisscompact.user_security_sessions(user_id, audience, last_seen_at desc)
  where revoked_at is null;

alter table swisscompact.user_security_sessions enable row level security;

drop policy if exists user_security_sessions_read_own
  on swisscompact.user_security_sessions;
create policy user_security_sessions_read_own
on swisscompact.user_security_sessions for select
using (user_id = auth.uid() or swisscompact.is_dashboard_admin());

revoke all on swisscompact.user_security_sessions from public, anon, authenticated;
grant select on swisscompact.user_security_sessions to authenticated, service_role;
grant insert, update, delete on swisscompact.user_security_sessions to service_role;

commit;
