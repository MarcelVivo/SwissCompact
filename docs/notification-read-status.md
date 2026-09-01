# Ungelesene Nachrichten und Benachrichtigungen

## Migration

Im Supabase SQL Editor einmal vollständig ausführen:

`supabase/migrations/20260916_notification_read_cursors.sql`

Die Migration speichert für jeden Benutzer und jedes Register einen persönlichen Lesestand. Bestehende Benutzer beginnen zum Zeitpunkt der Migration ohne historischen Rückstau.

## Kundenportal

Neue Ereignisse erscheinen als rotes `(01)` beim zuständigen Register:

- **Systemstatus:** neue oder erneut aufgetretene Bildschirmwarnungen
- **Meine Vorgänge:** neue Projektnachrichten von SwissCompact
- **Partnernetzwerk:** neue eingehende Einladungen und Angebote
- **Support:** neue Antworten des SwissCompact-Supports
- **Einstellungen:** neue zustimmungspflichtige Rechtsdokumente und bearbeitete Datenschutzanfragen

Auf Mobilgeräten zeigt **Mehr** zusätzlich die Summe der darin liegenden ungelesenen Register.

## SwissCompact-Verwaltung

Ungelesen gezählt werden neue Anfragen im Trichter, Kundennachrichten in Projekten und Support, Produktionsanfragen, Betriebswarnungen sowie Datenschutzanfragen. Sobald das jeweilige Register geöffnet wird, wird nur der persönliche Zähler des angemeldeten Benutzers zurückgesetzt.

Eigene ausgehende Nachrichten werden nicht als ungelesen gezählt. Die Oberfläche bleibt auch vor der Migration funktionsfähig; die Zähler werden dann lediglich nicht angezeigt.

Solange das Portal geöffnet ist, werden neue Zähler spätestens nach einer Minute aktualisiert. Beim Zurückkehren in das Browserfenster erfolgt die Prüfung sofort.
