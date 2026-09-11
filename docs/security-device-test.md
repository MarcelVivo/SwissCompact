# Produktiver Passkey- und MFA-Gerätetest

Der Test wird je einmal im internen Dashboard und im Kundenportal durchgeführt. Biometrische Freigaben werden ausschliesslich vom Kontoinhaber auf dem echten Gerät bestätigt.

## Voraussetzungen

- Supabase: Passkey Authentication aktiv
- Relying Party ID: `swisscompact.com`
- Origins: `https://www.swisscompact.com` und `https://swisscompact.com`
- Vercel: `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` in Production
- Authenticator-App bleibt als unabhängiger Rückfallweg eingerichtet

## Testmatrix

### Gerät 1 – iPhone oder iPad mit Face ID

1. Safari öffnen und normal mit Passwort plus TOTP anmelden.
2. Unter **Sicherheit** einen Passkey mit eindeutigem Gerätenamen einrichten.
3. Vollständig abmelden und alle Portal-Tabs schliessen.
4. Portal erneut öffnen und **Mit Face ID / Passkey anmelden** wählen.
5. Prüfen: Face ID erscheint, Anmeldung gelingt ohne Passwort, richtige Rolle und richtiger Kundenbetrieb werden angezeigt.
6. Unter **Sicherheit → Aktive Geräte** prüfen, dass die neue Sitzung erscheint.

### Gerät 2 – macOS mit Touch ID

Die Schritte wiederholen. Dabei einen eigenen Passkey anlegen; nicht nur den synchronisierten iPhone-Passkey verwenden. Anschliessend den TOTP-Rückfallweg einmal testen.

## Negativ- und Rückfalltests

- Biometrische Abfrage abbrechen: keine Anmeldung, verständliche Rückmeldung.
- Falschen TOTP-Code eingeben: Zugriff bleibt gesperrt.
- Richtigen TOTP-Code eingeben: Anmeldung gelingt.
- Eine andere aktive Sitzung über **Andere Sitzungen abmelden** widerrufen.
- Seite auf dem widerrufenen Gerät neu laden: erneute Anmeldung erforderlich.
- Einen Test-Passkey löschen und sicherstellen, dass der verbleibende Passkey und TOTP weiter funktionieren.

Der Test gilt erst als bestanden, wenn beide echten Geräte, TOTP-Rückfall und Sitzungswiderruf erfolgreich geprüft wurden. Passwörter, TOTP-Secrets und Wiederherstellungscodes gehören niemals in das Testprotokoll.
