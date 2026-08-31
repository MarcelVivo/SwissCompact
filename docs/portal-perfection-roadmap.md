# SwissCompact Portal – verbindlicher Ausbauplan

Stand: 31. August 2026. Dieses Dokument ist die dauerhafte Arbeitsliste für ein Portal, das für einen einzelnen Bildschirm ebenso verständlich bleibt wie für grosse, mehrstufige Display-Netzwerke.

## Bedienprinzipien

- Eine Seite beantwortet immer: Wo bin ich, was ist erledigt, was ist jetzt nötig, was passiert danach und wie kann ich zurück?
- Pro Schritt gibt es genau eine hervorgehobene Hauptaktion.
- Erweiterte Optionen bleiben eingeklappt, bis sie benötigt werden.
- Änderungen sind nachvollziehbar, möglichst rückgängig machbar und vor Veröffentlichung prüfbar.
- CRM-Kunde, Portalorganisation und Benutzeridentität werden getrennt geprüft.

## Phasen

### 1. Verifizierter Zugang und sichere Bestandsübernahme – in Arbeit

- [x] Portal zwingend mit genau einer CRM-Kundenkartei verknüpfen
- [x] Produktionsanfragen automatisch als Auftrag im CRM erfassen
- [x] Bestätigte E-Mail und aktive persönliche Mitgliedschaft verlangen
- [x] Benutzerzustände `eingeladen`, `aktiv`, `gesperrt`, `widerrufen` im Datenmodell abbilden
- [x] Mehrdeutige Bestandszuordnungen und unvollständige Migrationen technisch abbrechen
- [ ] Migration anhand `portal-rollout-checklist.md` prüfen und ausführen
- [ ] Produktionsdeployment prüfen

### 2. Interner Kunden-Onboarding-Assistent

- [ ] Kunde erfassen oder bestehende Kundenkartei wählen
- [ ] Kundenstatus und Portalberechtigung intern bestätigen
- [ ] Portal-Arbeitsbereich anlegen und Paket wählen
- [ ] Inhaber per E-Mail einladen
- [ ] Bestätigung und ersten Login überwachen
- [ ] Benutzer sperren, erneut einladen und Rollen ändern

### 3. Kundenbereich „Meine Vorgänge“

- [ ] Produktionsanfragen und Status anzeigen
- [ ] Offerten ansehen, annehmen oder ablehnen
- [ ] Aufträge, Termine und verantwortliche Person anzeigen
- [ ] Rechnungen und Zahlungsstatus anzeigen
- [ ] Dokumente sicher herunterladen
- [ ] Automatische, verständliche Statusbenachrichtigungen senden

### 4. Produktion, Freigaben und Kommunikation

- [ ] Briefing, Dateien und Nachrichten direkt beim Auftrag führen
- [ ] Entwürfe versionieren
- [ ] Kundenfreigabe oder Änderungswunsch erfassen
- [ ] Revisionsrunden und Zusatzkosten nachvollziehbar bestätigen
- [ ] Nach Abnahme Inhalte direkt in Archiv oder Kampagne übernehmen

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

