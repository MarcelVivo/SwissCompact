# Support- und SLA-Prozess

Der optionale KI-Erstsupport und seine Eskalationsregeln sind in [support-ai.md](support-ai.md) beschrieben.

SwissCompact führt Supportfälle direkt im Kundenportal. Jeder Fall erhält beim Eingang ein Paket, eine Priorität und ein unveränderliches Erstreaktionsziel. Das Ziel beschreibt die Zeit bis zur ersten persönlichen Reaktion durch SwissCompact; es ist keine garantierte Lösungszeit.

## Erstreaktionsziele je Abonnement

| Paket | Supportabdeckung | Kritisch | Hoch | Normal | Tief |
| --- | --- | ---: | ---: | ---: | ---: |
| Essential | Mo–Fr, 08:00–17:00 Uhr, Europe/Zurich | 8 Std. | 9 Std. | 2 Arbeitstage | 3 Arbeitstage |
| Business | Mo–Fr, 08:00–17:00 Uhr, Europe/Zurich | 4 Std. | 8 Std. | 1 Arbeitstag | 2 Arbeitstage |
| Enterprise | Kritische Totalausfälle rund um die Uhr; sonst Mo–Fr, 08:00–17:00 Uhr | 1 Std. | 4 Std. | 8 Std. | 1 Arbeitstag |

Ein Arbeitstag entspricht in der Fristberechnung neun Supportstunden. Wochenenden werden übersprungen. Schweizer Feiertage werden derzeit nicht automatisch berücksichtigt.

## Prioritäten

- **Kritisch:** Totalausfall, akutes Sicherheitsproblem oder alle produktiven Displays eines Kunden sind nicht nutzbar.
- **Hoch:** Der Betrieb ist stark beeinträchtigt, eine wesentliche Funktion oder ein wichtiger Bildschirm fällt aus.
- **Normal:** Bedienungsfrage oder Fehler mit praktikabler Ausweichmöglichkeit.
- **Tief:** Allgemeine Frage, Schulung, Optimierung oder Funktionswunsch ohne Betriebsbeeinträchtigung.

SwissCompact darf eine falsch gewählte Priorität korrigieren. Bei einer Neueinstufung wird das für die neue Priorität aktuell gültige Ziel ab dem ursprünglichen Eingangszeitpunkt berechnet und im Fall gespeichert.

## Ablauf

1. Der Kunde eröffnet im Portal unter **Support** einen Fall und wählt Kategorie, Priorität und optional einen betroffenen Bildschirm.
2. Das System speichert Paket und Reaktionsziel als Snapshot, berechnet die Frist und benachrichtigt SwissCompact per E-Mail.
3. Die interne Warteschlange sortiert nach offenen, kritischen und überfälligen Fällen. SwissCompact weist den Fall einer Person zu.
4. Die erste sichtbare Antwort stoppt die Messung der Erstreaktionszeit. Interne Notizen bleiben für Kunden unsichtbar.
5. Mit **Als gelöst markieren** wird eine sichtbare Lösungsantwort verlangt und der Fall zunächst auf **Gelöst** gesetzt.
6. Kundenantworten auf einen wartenden oder bereits gelösten Fall setzen ihn automatisch wieder auf **In Bearbeitung** und benachrichtigen SwissCompact.
7. Ein gelöster Fall kann bewusst **Erneut geöffnet** oder nach einer Sicherheitsabfrage **Endgültig geschlossen** werden. Geschlossene Fälle können nicht erneut geöffnet werden und nehmen keine weiteren Kundennachrichten an.

## Änderungen an SLA-Regeln

Nur der Hauptadmin kann Paketregeln ändern. Bestehende Fälle behalten Frist und Zielwert; neue Fälle verwenden die aktualisierte Regel. Wird ein bestehender Fall bewusst neu priorisiert, erhält er das Ziel der neu gewählten Priorität.

## Inbetriebnahme

1. `supabase/migrations/20260915_support_sla.sql` im Supabase SQL Editor vollständig ausführen.
2. Portal und Dashboard neu deployen.
3. Mit einem Testkunden je Paket einen normalen Fall eröffnen und Paket-Snapshot sowie Frist prüfen.
4. Im Dashboard eine sichtbare Antwort senden und kontrollieren, dass `first_responded_at` gesetzt wird.
5. Einen Fall auf **Wartet auf Kunde** setzen, als Kunde antworten und den automatischen Wechsel zu **In Bearbeitung** prüfen.
6. Einen internen Hinweis anlegen und sicherstellen, dass er im Kundenportal nicht erscheint.
7. Den Fall mit einer sichtbaren Lösungsantwort auf **Gelöst** setzen, erneut öffnen und nochmals lösen.
8. **Endgültig schließen** wählen, die Sicherheitsabfrage bestätigen und kontrollieren, dass der Kunde nicht mehr antworten kann.
