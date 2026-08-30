-- Sichere Aktivierung, Statusüberwachung und Konfigurationsversionen für Display-Player.
alter table swisscompact.tenant_displays
  add column if not exists pairing_code_hash text,
  add column if not exists pairing_expires_at timestamptz,
  add column if not exists device_token_hash text,
  add column if not exists paired_at timestamptz,
  add column if not exists software_version text,
  add column if not exists last_error text,
  add column if not exists configuration_version bigint not null default 1,
  add column if not exists last_config_at timestamptz;

create unique index if not exists tenant_displays_device_token_hash_unique
  on swisscompact.tenant_displays(device_token_hash)
  where device_token_hash is not null;

create index if not exists tenant_displays_pairing_expiry_idx
  on swisscompact.tenant_displays(pairing_expires_at)
  where pairing_code_hash is not null;

comment on column swisscompact.tenant_displays.device_key is
  'Legacy-Feld; neue Geräte verwenden ausschließlich gehashte device_token_hash-Werte.';
