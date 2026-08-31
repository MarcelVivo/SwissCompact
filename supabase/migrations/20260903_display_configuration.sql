-- Bildschirmkonfiguration: Displaygrösse, Bildtechnologie und Verwendungszweck.
alter table swisscompact.tenant_displays
  add column if not exists screen_size_inches integer
    check (screen_size_inches is null or screen_size_inches in (22, 24, 27, 32, 55, 65, 75)),
  add column if not exists panel_technology text not null default 'auto'
    check (panel_technology in ('auto', 'display', 'led')),
  add column if not exists use_category text
    check (use_category is null or use_category in ('menu', 'promotion', 'wayfinding'));
