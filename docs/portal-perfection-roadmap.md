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

### 5. Sichere Veröffentlichung und Displaybetrieb

- [ ] Gerätegetreue Vorschau vor Veröffentlichung
- [ ] Testveröffentlichung auf genau einem Bildschirm
- [ ] Letzte funktionierende Konfiguration und Rollback
- [ ] Offline-Cache und definierter Ersatzinhalt
- [ ] Warnungen bei offline gegangenen Displays und fehlerhaften Auslieferungen
- [ ] Konfliktregeln für gleichzeitig aktive Kampagnen

### 6. Medien- und Unternehmensskalierung

- [ ] Videos automatisch normalisieren und Vorschaubilder erzeugen
- [ ] Kampagnenvorlagen und wiederverwendbare Abläufe
- [ ] Bildschirmgruppen, Suche, Filter und Massenaktionen
- [ ] Prioritäten und Playlists je Standort, Gebäude, Stockwerk und Bereich
- [ ] Versionsverlauf und Wiederherstellung

### 7. Compliance und Betriebsreife

- [ ] AGB-, Datenschutz- und Auftragsverarbeitungs-Versionen protokollieren
- [ ] Datenexport, Aufbewahrung und Löschanfragen
- [ ] Sitzungs- und Geräteverwaltung, Passkeys und optionale MFA
- [ ] Backup-Wiederherstellung regelmässig testen
- [ ] Fehlerwarteschlangen, Zustellversuche und Betriebsalarme überwachen
- [ ] Support- und SLA-Prozess je Abonnement definieren

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
