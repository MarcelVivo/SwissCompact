# SwissCompact Sales Assistant

## Überblick

Ein KI-CTA-Funnel als schlichtes Chat-Panel (kein animierter Charakter), der Text und Live-Sprache unterstützt: er versteht Unternehmen, Ziel und Problem eines Besuchers, empfiehlt passende Leistungen aus einer festen Service-Bibliothek und übergibt qualifizierte Leads per E-Mail (Resend) und CRM-Eintrag (Supabase).

Architektur, adaptiert aus dem AILA-System auf marcelspahr.ch (siehe `/Users/marcelspahr/Desktop/MSBewerbungWebseite/docs/AILA-SALES-AGENT.md`), aber:

- **Deutsch only** (keine Sprachumschaltung)
- **Kein animierter Video-Charakter** — ein CSS-Statuspunkt statt Greenscreen-Videos
- **Vanilla TypeScript**, kein React (die Website ist eine statische Vite-Site)
- **Vercel Serverless Functions** unter `/api/assistant/*` statt Next.js API-Routen

## Code-Struktur

```
api/_lib/assistant/     Gemeinsame Logik (Typen, Service-Bibliothek, Engine, Prompt, Schema, Security)
api/assistant/          Die vier Routen: chat, speech, realtime, lead
src/ui/salesAssistant.ts  Frontend-Widget (mountSalesAssistant())
```

Content-Platzhalter, die fachlich noch geprüft werden müssen (aus Website-Copy abgeleitet, keine autoritative Quelle):
- `api/_lib/assistant/services.ts` — Service-Bibliothek
- `api/_lib/assistant/knowledge.ts` — Unternehmens-/Sektionswissen für den Prompt

## Supabase — einmalig einzurichten

Läuft im gemeinsam genutzten Projekt `marcelspahr-ch` (`https://dmqgitvcpxtxjxotlrja.supabase.co`), eigenes Schema `swisscompact` (bereits angelegt und über die Data API exponiert). Im SQL-Editor ausführen:

```sql
create table if not exists swisscompact.kunden (
  id             uuid primary key default gen_random_uuid(),
  firmenname     text,
  kontaktperson  text not null,
  email          text,
  telefon        text,
  branche        text,
  status         text not null default 'lead'
                   check (status in ('lead','interessent','kunde','inaktiv')),
  adresse        text,
  notizen        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists swisscompact.deals (
  id                  uuid primary key default gen_random_uuid(),
  titel               text not null,
  kunden_id           uuid references swisscompact.kunden(id) on delete set null,
  status              text not null default 'lead'
                        check (status in ('lead','erstgespraech','angebot','verhandlung','gewonnen','verloren')),
  wert                numeric(10,2),
  wahrscheinlichkeit  integer not null default 50 check (wahrscheinlichkeit between 0 and 100),
  geplanter_abschluss date,
  notizen             text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists swisscompact.kontaktanfragen (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  nachricht   text,
  sprache     text not null default 'de' check (sprache in ('de','en')),
  quelle      text not null default 'sales-assistant',
  status      text not null default 'neu' check (status in ('neu','gelesen','beantwortet')),
  created_at  timestamptz not null default now()
);

create or replace function swisscompact.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_kunden_updated_at on swisscompact.kunden;
create trigger trg_kunden_updated_at
  before update on swisscompact.kunden
  for each row execute function swisscompact.update_updated_at();

drop trigger if exists trg_deals_updated_at on swisscompact.deals;
create trigger trg_deals_updated_at
  before update on swisscompact.deals
  for each row execute function swisscompact.update_updated_at();

-- RLS aktiv, bewusst ohne Policies: der Browser spricht Supabase nie direkt
-- an, jeder Schreibzugriff läuft über /api/assistant/lead.ts mit dem
-- service_role Key, der RLS umgeht.
alter table swisscompact.kunden          enable row level security;
alter table swisscompact.deals           enable row level security;
alter table swisscompact.kontaktanfragen enable row level security;

grant usage on schema swisscompact to anon, authenticated, service_role;
grant all on all tables in schema swisscompact to service_role;
alter default privileges in schema swisscompact grant all on tables to service_role;
```

## Environment Variables (Vercel Projekt-Einstellungen)

| Variable | Pflicht für | Verhalten wenn leer |
|---|---|---|
| `OPENAI_API_KEY` | chat, speech, realtime | 503 |
| `OPENAI_ASSISTANT_MODEL` | chat | optional, Default `gpt-5.6-terra` |
| `OPENAI_ASSISTANT_TTS_MODEL` | speech | optional, Default `gpt-4o-mini-tts` |
| `OPENAI_ASSISTANT_VOICE` | speech, realtime | optional, Default `alloy` |
| `OPENAI_ASSISTANT_REALTIME_MODEL` | realtime | optional, Default `gpt-realtime-2.1` |
| `SUPABASE_URL` | lead | 503 — `https://dmqgitvcpxtxjxotlrja.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | lead | 503 — aus Supabase Dashboard kopieren, nie in Chat/Screenshot teilen |
| `RESEND_API_KEY` | lead | 503 — blockiert bis Resend-Domain-Verifizierung für swisscompact.com erledigt ist |
| `SITE_URL` | alle vier (Origin-Check) | optional |

Solange `RESEND_API_KEY` fehlt, funktioniert die Website weiterhin normal — nur die Lead-Übergabe am Ende des Chats liefert 503, bis Resend eingerichtet ist.

## Lokal testen

`vite dev` bedient `/api/*` nicht. Mit der `vercel`-CLI (als devDependency installiert) lokal testen:

```bash
vercel dev
```

Dafür eine `.env` mit den obigen Variablen anlegen (nicht committen — `.env*` ist bereits in `.gitignore`, ausser `.env.example`).

## Manuelle Testschritte

1. Off-Topic-Frage stellen ("Wo gibt's gutes Sushi in Zürich?") → kurze Umleitung, keine inhaltliche Antwort.
2. Mehrere Nachrichten mit Unternehmen → Ziel → Problem senden → Stage schreitet fort, bekannte Fakten werden nicht erneut erfragt.
3. Bis zur Empfehlung führen → geprüft, dass die vorgeschlagenen Leistungen aus der echten Bibliothek stammen.
4. `OPENAI_API_KEY` temporär entfernen → Chat liefert trotzdem eine Fallback-Frage statt eines Fehlers.
5. Live-Gespräch starten, sprechen → Transkript + gesprochene Antwort funktionieren, Unterbrechen ist möglich.
6. Kontaktformular mit Einwilligung absenden → je eine neue Zeile in `swisscompact.kontaktanfragen`/`kunden`/`deals`, zwei E-Mails (sobald Resend verifiziert ist).
7. Honeypot-Feld per Devtools befüllen und absenden → stille Erfolgsmeldung, aber keine neuen Datensätze.

Automatisiert: `npm run test:assistant` (`scripts/sales-assistant-smoke.mjs`, braucht eine laufende `vercel dev`-Instanz oder eine Deploy-Preview-URL über `SWISSCOMPACT_BASE_URL`).

## Offen / bewusst nicht Teil dieser Version

- Resend-Domain-Verifizierung für swisscompact.com + DNS-Einträge bei Hostpoint (separater Schritt).
- Fachliche Prüfung von `services.ts` und `knowledge.ts` durch Marcel.
- Dauerhafter, containerübergreifender Rate-Limiter (aktuell best-effort in-memory).
- Ein CRM-Dashboard zum Ansehen der `swisscompact`-Leads (existiert für AILA, hier nicht gebaut).
