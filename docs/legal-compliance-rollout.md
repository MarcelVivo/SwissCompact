# Rechtsdokumente Version 1.0 – Veröffentlichung

Die Rechtsdokumente haben eine gemeinsame, versionierte Quelle unter `docs/legal/`. Die öffentliche Website rendert diese Texte unter `/legal.html`; die Migration übernimmt exakt denselben Inhalt in die unveränderbare Portalhistorie.

## Veröffentlichte Fassung

- `docs/legal/terms-v1.0.md`: Nutzungsbedingungen, persönliche Zustimmung jedes Portalbenutzers
- `docs/legal/privacy-v1.0.md`: Datenschutzerklärung, reine Information ohne fingierte Einwilligung
- `docs/legal/data-processing-v1.0.md`: Vereinbarung zur Auftragsbearbeitung, einmalige Bestätigung durch Inhaber oder Administrator des Kundenbetriebs

Anbieter der aktuellen Vorgründungsphase ist Marcel Spahr, handelnd unter SwissCompact, Schwarzenburgstrasse 65, 3008 Bern. Die Texte nennen keine noch nicht gegründete Gesellschaft und keine nicht vorhandene MWST-Nummer.

## 1. Technische Prüfung

```bash
npm run legal:generate
npm run test:legal
npm run build
```

`legal:generate` erzeugt `supabase/migrations/20260920_legal_documents_v1.sql` aus den drei Markdown-Dateien. Der Smoke-Test stellt sicher, dass kein Entwurfsmarker enthalten ist, die Migration die Texte unverändert enthält und die öffentliche Website Anbieter- und Datenschutzlinks zeigt.

## 2. Datenbank veröffentlichen

Den vollständigen Inhalt von `supabase/migrations/20260920_legal_documents_v1.sql` im Supabase SQL Editor ausführen. Die Migration ist wiederholbar:

- eine identische bereits veröffentlichte Version bleibt unverändert;
- eine abweichende bereits veröffentlichte Version führt zu einem Fehler statt zu einer stillen Änderung;
- eine ältere veröffentlichte Fassung wird als `superseded` erhalten;
- Version 1.0 wird mit fester Wirksamkeit ab 2. September 2026 veröffentlicht.

Danach kontrollieren:

```sql
select document_type, acceptance_scope, version, title,
       requires_acceptance, status, effective_at, published_at, content_hash
from swisscompact.legal_documents
where version = '1.0'
order by document_type;
```

Erwartet werden drei Zeilen mit Status `published`. Nur Datenschutz hat `requires_acceptance = false`; die Auftragsbearbeitung hat `acceptance_scope = 'tenant'`.

## 3. Website veröffentlichen

Die Codeänderungen committen und nach `main` pushen. Nach dem Vercel-Deployment folgende Adressen prüfen:

- `https://swisscompact.com/legal.html#anbieter`
- `https://swisscompact.com/legal.html#datenschutz`
- `https://swisscompact.com/legal.html#nutzungsbedingungen`
- `https://swisscompact.com/legal.html#auftragsbearbeitung`

Die Datenschutzerklärung ist zusätzlich direkt in den Einwilligungsformularen des Verkaufsassistenten und des Showroom-Konfigurators verlinkt.

## 4. Portalprüfung

1. Als Inhaber anmelden: Nutzungsbedingungen und AVV müssen offen sein; Datenschutz erscheint als Information.
2. Beide zustimmungspflichtigen Dokumente vollständig öffnen und bestätigen.
3. Unter **Einstellungen → Dokumente und Zustimmungen** Version, Zeitpunkt und Prüfsumme kontrollieren.
4. Als weiterer Benutzer anmelden: Nur die persönlichen Nutzungsbedingungen müssen noch bestätigt werden.
5. Frühere Fassungen und Nachweise dürfen nicht bearbeitet oder gelöscht werden.

## Pflege

Rechtliche oder tatsächliche Änderungen werden niemals in Version 1.0 überschrieben. Stattdessen neue Markdown-Dateien und eine neue Versionsmigration anlegen. Besonders bei Gesellschaftsgründung, MWST-Registrierung, neuen Datenstandorten, Unterauftragnehmern, Tracking-Technologien oder wesentlich geänderten Leistungen müssen Anbieterangaben und Datenschutzerklärung aktualisiert werden.

Die inhaltliche Prüfung stützt sich auf die öffentlich zugänglichen Vorgaben von EDÖB und SECO sowie die aktuellen Auftragsbearbeitungsbedingungen der eingesetzten Hauptanbieter. Sie ersetzt keine individuelle Rechtsberatung durch eine in der Schweiz zugelassene Fachperson.
