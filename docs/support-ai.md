# KI-Erstsupport

Der KI-Erstsupport beantwortet authentifizierte Supportanfragen im Kundenportal, solange dies ohne Systemänderungen und mit ausreichender Sicherheit möglich ist. Jede KI-Nachricht ist im Portal und im Dashboard als `SwissCompact KI-Support · KI-Assistent` gekennzeichnet.

## Aktivierung

1. Migration `supabase/migrations/20260917_support_ai.sql` ausführen.
2. `OPENAI_API_KEY` in der Serverumgebung setzen. Der Schlüssel darf nie als Vite-Variable oder im Browser hinterlegt werden.
3. Optional `OPENAI_SUPPORT_MODEL` setzen. Ohne Wert wird `OPENAI_ASSISTANT_MODEL` und danach der serverseitige Standard verwendet.
4. Im Dashboard unter `Support & SLA` die KI-Wissensbasis prüfen und weitere Anleitungen als Entwurf erfassen. Ein Eintrag wird nur verwendet, wenn er durch den Hauptadmin freigegeben wurde.

Die Responses API wird mit `store: false`, einem strikten JSON-Schema, niedrigem Reasoning-Aufwand und einem serverseitigen Timeout aufgerufen.

## Automatische Eskalation

Ohne KI-Verarbeitung an das Supportteam gehen:

- kritische Anfragen;
- Abonnement- und Rechnungsfragen;
- Funktionswünsche;
- ausdrücklicher Wunsch nach einer persönlichen Bearbeitung;
- niedrige Modellsicherheit;
- fehlende oder ungültige strukturierte Antwort;
- technische API- oder Speicherfehler;
- spätestens nach drei KI-Versuchen.

Der Admin-Zähler für das Register `Support` zählt bei aktivierter Migration nur eskalierte Tickets. Erfolgreich durch die KI bearbeitete Kundennachrichten erzeugen deshalb keinen unnötigen Admin-Eingriff.

## Berechtigungen

Der KI-Erstsupport besitzt nur serverseitigen Lesezugriff auf:

- den betreffenden Supportfall;
- dessen sichtbaren Nachrichtenverlauf;
- freigegebene Wissenseinträge;
- den Namen des optional betroffenen Bildschirms.

Er erhält keine Werkzeuge zum Ändern von Abonnementen, Rechnungen, Benutzern, Daten, Kampagnen oder Displays. Der API-Schlüssel bleibt ausschliesslich in der Serverumgebung.

## Admin-Steuerung

Im Supportdialog stehen für offene Fälle zwei Aktionen bereit:

- `Persönlich übernehmen` deaktiviert die KI und weist den Fall bei Bedarf dem handelnden Admin zu.
- `KI erneut versuchen` setzt eine bewusste neue Runde mit zurückgesetztem Versuchszähler frei.

Jeder KI-Lauf wird in `support_ai_runs` protokolliert. Entscheidungen und Eskalationen werden zusätzlich im Tenant-Auditlog erfasst. Prompts enthalten keine E-Mail-Adresse und keine Zugangsdaten.

## Wissensbasis verwalten

Die Verwaltung befindet sich im Dashboard im Register `Support` unter `KI-Wissensbasis`.

- Admins können neue Anleitungen als Entwurf erstellen und vorhandene Einträge bearbeiten.
- Jede Bearbeitung zieht eine bestehende Freigabe sofort zurück.
- Nur der Hauptadmin kann einen geprüften Entwurf für Kundenantworten freigeben.
- Freigegebene Anleitungen werden archiviert statt gelöscht und bleiben dadurch nachvollziehbar.
- Nur ein noch nie freigegebener Entwurf kann durch den Hauptadmin endgültig gelöscht werden.
- Kategorie, Quelle, Freigabezeitpunkt und freigebende Person werden im Dashboard angezeigt.

Alle Aktionen werden zusätzlich im Dashboard-Auditlog gespeichert.

## Abschluss

Die KI darf einen Fall nur als gelöst markieren, wenn der letzte Kundenbeitrag ausdrücklich bestätigt, dass das Problem behoben ist, das Modell dies ebenfalls bestätigt und die Antwortsicherheit mindestens 90 Prozent beträgt. Eine weitere Kundenantwort öffnet einen gelösten Fall über den bestehenden Supportablauf wieder.
