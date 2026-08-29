# SwissCompact Dashboard – Inbetriebnahme

Das Dashboard ist unter `/dashboard` erreichbar. Es verwendet ausschliesslich serverseitige Supabase-Zugangsdaten und speichert die Sitzung in `HttpOnly`, `Secure`, `SameSite=Strict` Cookies.

## 1. Datenbank einrichten

1. Im Supabase SQL Editor die Migration `supabase/migrations/20260828_dashboard_core.sql` ausführen.
2. Unter **Project Settings → API → Exposed schemas** das Schema `swisscompact` ergänzen.
3. Prüfen, dass der private Storage-Bucket `swisscompact-documents` angelegt wurde.

Die Migration legt CRM, Auftragstrichter, Projekte, Aufgaben, Vier-Augen-Freigaben, Offerten, Rechnungen, doppelte Buchhaltung, Gründerabrechnung, Abonnements, KI-Aufträge, Marketing und Audit-Protokoll an. Row Level Security ist auf allen Dashboard-Tabellen aktiv.

## 2. Admin-Zugänge anlegen

In Supabase unter **Authentication → Users** genau diese Benutzer erstellen:

- `kontakt@swisscompact.com` – Marcel Spahr, Hauptadmin
- `thomas.peter@swisscompact.com` – Thomas Peter, Admin

Temporäre starke Passwörter setzen und sicher getrennt übermitteln. Beim ersten Login fordert das Dashboard zwingend die Einrichtung einer Authenticator-App. Andere E-Mail-Adressen werden vom Server abgewiesen, auch wenn dafür ein Supabase-Benutzer existiert.

Marcel und Thomas besitzen dieselben operativen Lese- und Schreibrechte. Sicherheitsverwaltung, künftige Benutzerkonten, Backups und Integrationen bleiben Marcel als Hauptadmin vorbehalten.

## 3. Vercel

Diese Variablen müssen für Production, Preview und Development gesetzt sein:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Den Service-Role-Key niemals als `VITE_…` Variable anlegen oder im Browser verwenden. Nach dem Deployment `/dashboard` aufrufen, anmelden und 2FA einrichten.

## 4. Vorgründungsphase

Die Kollektivgesellschaft ist noch nicht gegründet und für 2027 vorgesehen. Das System führt deshalb:

- die Vorgründungsbuchhaltung ab 5. August 2026,
- Marcel Spahr bis zur Gründung als temporären Rechnungssteller,
- CHF 600 Auslagen von Marcel als Gesellschafterdarlehen,
- CHF 300 Überweisung von Thomas an Marcel als bestätigten Ausgleich,
- danach eine wirtschaftliche Belastung von CHF 300 je Inhaber.

Firmenname, UID, gemeinsames Bankkonto und QR-IBAN werden bei der Gründung kontrolliert in den Einstellungen umgestellt. Vor produktiven Rechnungen und Abschlüssen ist die Prüfung durch eine Schweizer Treuhand- oder Rechtsfachperson empfohlen.

## 5. Bereits funktionsfähig

- passwortgeschützter Zugang und verpflichtende TOTP-2FA
- Rollenprüfung und unveränderbares Audit-Protokoll
- responsive Übersicht für Desktop und Mobilgeräte
- Kunden erfassen
- Kunden suchen, filtern und mit Kontaktdaten, Adresse und Notizen bearbeiten
- Anfragen erfassen, detailliert bearbeiten und durch alle Phasen verschieben
- neue Website- und KI-Assistent-Anfragen automatisch in Kundenkartei und Auftragstrichter übernehmen
- Aufgaben erfassen und erledigen
- bestätigte Aufträge in nummerierte Projekte überführen
- Software-/UX-Verantwortung Marcel und Hardware-/Montageverantwortung Thomas zuweisen
- Aufgaben direkt Projekten zuordnen und ihren Arbeitsstatus führen
- 50/30/20-Zahlungsstatus mit Reihenfolge, Projektstart-Sperre und echter Vier-Augen-Freigabe führen
- Offerten mit nummerierten Entwürfen, Leistungspositionen, automatischer CHF-Kalkulation und Gültigkeit erstellen
- Offerten erst nach getrennter Zustimmung von Marcel und Thomas verbindlich freigeben; Bearbeitungen invalidieren offene Freigaben
- Gründerbewegungen und Belegstatus anzeigen; Kategorien ergänzen
- KI-Bot- und Budgetübersicht
- vorbereitete Datenmodelle für Buchhaltung, Offerten, Rechnungen, Abos und Marketing

## 6. Nächste Ausbauschritte

Die Module werden auf diesem Fundament in der bestätigten Reihenfolge vertieft: Projektsteuerung, Dokument- und Freigabeworkflow, Buchungsdialoge und Bankimport, QR-Rechnungen, getrenntes Kundenportal, produktive KI-Aktionen, Marketing-Integrationen und Displaysteuerung.
