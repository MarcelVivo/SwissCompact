# SwissCompact Portal – verbindlicher Ausbauplan

Stand: 31. August 2026. Dieses Dokument ist die dauerhafte Arbeitsliste für ein Portal, das für einen einzelnen Bildschirm ebenso verständlich bleibt wie für grosse, mehrstufige Display-Netzwerke.

## Bedienprinzipien

- Eine Seite beantwortet immer: Wo bin ich, was ist erledigt, was ist jetzt nötig, was passiert danach und wie kann ich zurück?
- Pro Schritt gibt es genau eine hervorgehobene Hauptaktion.
- Erweiterte Optionen bleiben eingeklappt, bis sie benötigt werden.
- Änderungen sind nachvollziehbar, möglichst rückgängig machbar und vor Veröffentlichung prüfbar.
- CRM-Kunde, Portalorganisation und Benutzeridentität werden getrennt geprüft.

## Phasen

### 1. Verifizierter Zugang und sichere Bestandsübernahme – abgeschlossen

- [x] Portal zwingend mit genau einer CRM-Kundenkartei verknüpfen
- [x] Produktionsanfragen automatisch als Auftrag im CRM erfassen
- [x] Bestätigte E-Mail und aktive persönliche Mitgliedschaft verlangen
- [x] Benutzerzustände `eingeladen`, `aktiv`, `gesperrt`, `widerrufen` im Datenmodell abbilden
- [x] Mehrdeutige Bestandszuordnungen und unvollständige Migrationen technisch abbrechen
- [x] Migration anhand `portal-rollout-checklist.md` prüfen und ausführen
- [x] Produktionsdeployment und bestätigten Kundenlogin prüfen

### 2. Interner Kunden-Onboarding-Assistent – umgesetzt

- [x] Kunde erfassen oder bestehende Kundenkartei wählen
- [x] Kundenstatus und Portalberechtigung intern bestätigen
- [x] Portal-Arbeitsbereich anlegen und Paket wählen
- [x] Inhaber per E-Mail einladen und Passwort sicher festlegen lassen
- [x] Bestätigung und ersten Login überwachen
- [x] Benutzer sperren, erneut einladen und Rollen ändern

### 3. Kundenbereich „Meine Vorgänge“ – umgesetzt

- [x] Produktionsanfragen und Status anzeigen
- [x] Offerten ansehen, annehmen oder ablehnen
- [x] Aufträge, Termine und verantwortliche Person anzeigen
- [x] Rechnungen und Zahlungsstatus anzeigen
- [x] Dokumente sicher herunterladen
- [x] Automatische, verständliche Statusbenachrichtigungen senden

### 4. Produktion, Freigaben und Kommunikation – abgeschlossen

- [x] Briefing, Dateien und Nachrichten direkt beim Auftrag führen
- [x] Entwürfe versionieren
- [x] Kundenfreigabe oder Änderungswunsch erfassen
- [x] Revisionsrunden und Zusatzkosten nachvollziehbar bestätigen
- [x] Nach Abnahme Inhalte direkt in Archiv oder Kampagne übernehmen
- [x] Migration `20260904_project_collaboration.sql` in Supabase ausführen und Datenmodell kontrollieren
- [x] Rückwärtskompatiblen Produktions-Build und automatisierte Ende-zu-Ende-Strukturtests ausführen

### 5. Sichere Veröffentlichung und Displaybetrieb – umgesetzt, Praxistest ausstehend

- [x] Gerätegetreue Vorschau vor Veröffentlichung
- [x] Testveröffentlichung auf genau einem Bildschirm
- [x] Letzte funktionierende Konfiguration und Rollback
- [x] Offline-Cache und definierter Ersatzinhalt
- [x] Warnungen bei offline gegangenen Displays und fehlerhaften Auslieferungen
- [x] Konfliktregeln für gleichzeitig aktive Kampagnen
- [x] Migration `20260905_safe_display_delivery.sql` in Supabase ausführen und kontrollieren
- [ ] Vorschau, Einzelbildschirm-Test, Offline-Ersatz und Rollback mit einem echten Player prüfen

### 6. Medien- und Unternehmensskalierung

- [x] Medien vor Upload dekodieren, technische Metadaten erfassen und Vorschaubilder erzeugen
- [x] Unvollständige oder nicht lesbare Medien von Kampagnen und Player-Auslieferung ausschliessen
- [x] Videos serverseitig über Mux in adaptive, displaytaugliche Auslieferungsformate normalisieren
- [x] Optionales Partnernetzwerk mit fairen Werbepunkten, Tausch/CHF/Mischform und beidseitiger Erfüllungsbestätigung
- [x] Kampagnenvorlagen und wiederverwendbare Abläufe
- [x] Bildschirmgruppen, Suche, Filter und Massenaktionen
- [x] Prioritäten und Playlists je Standort, Gebäude, Stockwerk und Bereich
- [x] Versionsverlauf und Wiederherstellung

### 7. Compliance und Betriebsreife

- [x] Verständliches Systemstatus- und Warnungscenter für Displays, Auslieferung, Medien und Kampagnen
- [x] AGB-, Datenschutz- und Auftragsverarbeitungs-Versionen technisch protokollieren und sicheren Hauptadmin-Veröffentlichungsablauf bereitstellen; geprüfte Texte selbst ausstehend
- [x] Datenexport, Aufbewahrung und kontrollierte Löschanfragen mit internem Prüfprozess
- [x] Sitzungs- und Geräteverwaltung, Passkeys und optionale MFA technisch bereitstellen; produktive Passkey-Konfiguration und Gerätetest ausstehend
- [x] Kontrollierten Backup-Wiederherstellungsablauf mit Testnachweisen bereitstellen; erster isolierter Praxistest ausstehend
- [x] Fehlerquellen, Zustellversuche und Betriebsalarme zentral überwachen; externe Alarmweiterleitung optional ergänzen
- [x] Support- und SLA-Prozess je Abonnement mit Paketregeln, Kunden-Supportcenter, interner Warteschlange und Erstreaktionsnachweis bereitstellen; produktiver End-to-End-Test nach Migration ausstehend

## Verbindliche Datenquellen

| Sachverhalt | Führendes Objekt |
| --- | --- |
| Kunde und Kontaktdaten | CRM-Kundenkartei |
| Portalorganisation | Mandant (`tenant`) |
| Persönlicher Zugriff | Mitgliedschaft und Supabase-Benutzer |
| Kundenanfrage | Produktionsanfrage |
| Verkauf und Offerte | Verkaufschance und Offerte |
| Umsetzung | Projekt beziehungsweise Produktionsauftrag |
| Wiederverwendbare Medien | Medienarchiv |
| Ausspielung | Kampagne, Zielbildschirm und Playlist |
