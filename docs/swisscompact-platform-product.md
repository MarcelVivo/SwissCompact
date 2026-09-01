# SwissCompact Gesamtlösung – Produktgrundlage

Stand: 30. August 2026. Dieses Dokument trennt die Produkte technisch und kaufmännisch, damit Website, internes Dashboard und Kundensoftware nicht miteinander vermischt werden.

## Umsetzungsstand

Die erste Portalgrundlage ist umgesetzt: mandantenfähiges Datenmodell, serverseitige Kundentrennung, Rollen, zentraler Portalzugang, Content-Bibliothek, Kampagnen, Display-Status, Standorte und Abonnementübersicht. Geräteanbindung, Medien-Upload, Freigabeworkflows, Playlists und KI-Erstellung folgen auf dieser gesicherten Grundlage.

## Produktversprechen

SwissCompact verbindet Website, Unternehmenssoftware, Marketing, Displays und LED-Technologie zu einem intelligent gesteuerten Gesamtsystem. Strategie, UX, Entwicklung, Inhalte, Hardware, Montage, Betrieb und Support kommen aus einer Hand.

## Vier Bausteine

### 1. Website & digitale Präsenz

- Strategie, Informationsarchitektur und UX
- Design und technische Entwicklung
- Texte, Bilder, Inhalte und Kampagnenflächen
- SEO und GEO
- Analytics, laufende Optimierung und Wartung

Die Erstellung oder der Relaunch ist ein Projekt. Hosting, Wartung, Updates und Weiterentwicklung können danach Bestandteil eines Software- und Service-Abonnements sein.

### 2. Business Dashboard

Kundenspezifische Unternehmenssoftware, beispielsweise unter `firmaxy.ch/dashboard`:

- CRM und Kundenkartei
- ERP, Aufträge, Projekte, Offerten und Rechnungen
- Aufgaben, Kalender und Freigaben
- Marketing, Kampagnen und Auswertungen
- Automatisierte Abläufe und kontrollierte KI-Bots

Das Business Dashboard wird pro Kunde modular zusammengestellt. Es ist nicht das interne SwissCompact Operations Dashboard.

### 3. SwissCompact Display Portal

Eigenständige Software zur Steuerung und Betreuung digitaler Flächen:

- zentrale Variante: `swisscompact.com/portal`
- White-Label-Variante: `firmaxy.ch/portal`
- Standorte, Displays und LED-Netzwerke
- Bilder, Texte, Videos, Vorlagen und Playlists
- Kampagnen, Zeitpläne und Freigaben
- Gerätestatus, Monitoring und Support
- KI-gestützte Content-Erstellung und Bedienhilfe

Das Portal bleibt technisch ein SwissCompact Produkt, auch wenn es unter der Domain und im Erscheinungsbild des Kunden betrieben wird.

### 4. Hardware & Betrieb

- Beratung und Hardware-Konzeption
- Displays, LED-Systeme und Systemintegration
- Montage, Einrichtung und Konfiguration vor Ort
- Monitoring, Wartung, Support und Weiterentwicklung

Hardware- und Umsetzungsprojekte folgen dem Zahlungsplan 50 % vor Projektstart, 30 % bei Montagebeginn und 20 % nach unterzeichneter Kundenabnahme. Software-Abonnements sind davon ausgenommen.

## Zugänge und Mandantentrennung

| Zugang | Benutzer | Zweck |
| --- | --- | --- |
| `swisscompact.com/dashboard` | SwissCompact Admins | Interne Kunden-, Projekt-, Finanz- und Betriebsführung |
| `kundendomain.ch/dashboard` | Mitarbeiter des Kunden | Kundenspezifisches CRM/ERP/Marketing-System |
| `swisscompact.com/portal` | Display-Kunden | Zentrale Display- und LED-Steuerung |
| `kundendomain.ch/portal` | White-Label-Kunden | Identische Display-Plattform unter eigener Domain |

Jeder Kunde ist ein eigener Mandant. Benutzer, Rollen, Daten, Dateien, Standorte und Geräte müssen serverseitig voneinander getrennt sein. Die sichtbare Domain darf diese Sicherheitsgrenze niemals ersetzen.

## Abonnementmodell – erste verbindliche Struktur

Alle Pakete werden monatlich verrechnet und haben eine Mindestlaufzeit von 12 Monaten. Die Preisformel kombiniert eine Plattform-Grundgebühr mit dem Umfang der aktivierten Module sowie Zuschlägen pro Standort und Display. Konkrete CHF-Preise werden erst nach Kalkulation veröffentlicht.

### Essential

Für eine klare digitale Basis und einen überschaubaren Betrieb:

- Hosting, Sicherheits- und Funktionsupdates
- Wartung, Bugbehandlung und kleine Reparaturen
- Kernfunktionen des Display Portals
- einfache Benutzer- und Inhaltsverwaltung
- Standard-Support
- Erstreaktion bei kritischen Fällen innerhalb von 8 Supportstunden; normale Fälle innerhalb von 2 Arbeitstagen

### Business

Für wachsende Unternehmen und mehrere Flächen oder Prozesse:

- alle Essential-Leistungen
- mehrere Standorte und erweiterte Display-Netzwerke
- Business-Dashboard-Module für CRM, Projekte und Marketing
- Vorlagen, Freigaben, Monitoring und Automatisierungen
- KI-Unterstützung und priorisierter Support
- Erstreaktion bei kritischen Fällen innerhalb von 4 Supportstunden; normale Fälle innerhalb eines Arbeitstags

### Enterprise

Für individuelle Plattformen, Integrationen und große Netzwerke:

- alle Business-Leistungen
- White-Label-Domain und kundenspezifisches Erscheinungsbild
- individuelle ERP-/CRM-Module und Integrationen
- erweiterte Rollen, Freigaben und KI-Automationen
- vereinbartes SLA und persönliche Betreuung
- Erstreaktion bei kritischen Totalausfällen rund um die Uhr innerhalb einer Stunde; normale Fälle innerhalb von 8 Supportstunden

## Technische Zielarchitektur

- eine mandantenfähige Plattform mit gemeinsamer Codebasis
- Domain-Auflösung auf einen eindeutig hinterlegten Kunden-Mandanten
- rollenbasierte Berechtigungen innerhalb jedes Mandanten
- getrennte Bereiche für Business Dashboard und Display Portal
- revisionsfähiges Audit-Protokoll für wichtige Änderungen
- sichere Medienbibliothek und kontrollierte Veröffentlichung auf Displays
- APIs für Hardware-Player, Website, Marketing und spätere Integrationen
- Abonnement- und Funktionsfreigaben pro Mandant

## Nächste Produktentscheidungen

Vor der Preisveröffentlichung werden kalkuliert:

1. Plattform-Grundpreis je Paket
2. Preis je zusätzlichem Standort
3. Preis je Display oder LED-Controller
4. enthaltenes KI-Kontingent und Mehrverbrauch
5. Speicher- und Traffic-Limiten
6. Vertragliche Einordnung und Preiswirkung der technisch definierten Support- und Erstreaktionsziele
7. einmalige Einrichtungs-, Website- und White-Label-Gebühren
