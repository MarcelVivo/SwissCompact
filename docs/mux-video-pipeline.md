# Mux-Videopipeline – sichere Aktivierung

Die Anwendung ist so gebaut, dass Bilder weiterhin privat in Supabase liegen. Videos werden erst dann direkt zu Mux hochgeladen und automatisch normalisiert, wenn die vollständige Mux-Konfiguration aktiviert wurde. Ohne Aktivierung bleibt der bisherige Supabase-Videoupload verfügbar.

## Ergebnis für Portalbenutzer

1. Video auswählen und lokal technisch prüfen.
2. Datei blockweise und wiederholbar direkt hochladen, ohne Umweg über den SwissCompact-Server.
3. Im Portal erscheint `VIDEO WIRD AUFBEREITET`.
4. Mux erzeugt eine normalisierte MP4-Datei bis zur ursprünglichen Auflösung, maximal 4K.
5. Erst nach dem signierten Mux-Webhook erscheint `DISPLAYBEREIT` und die Freigabe wird möglich.
6. Endgültiges Löschen im Archiv entfernt auch das zugehörige Mux-Asset.

Die Anzahl Videos ist im Portal nicht begrenzt. Abrechnung und technische Kontingente richten sich nach dem bei Mux aktivierten Tarif.

Neue Mux-Videos werden mit der Qualitätsstufe `plus` verarbeitet. Diese Stufe ist
für professionelle Marken- und Displayinhalte vorgesehen und verursacht bei Mux
Kodierungskosten pro hochgeladener Videominute. Bereits vorhandene Assets werden
durch eine Änderung dieser Einstellung nicht neu verarbeitet.

## 1. Mux-Zugang vorbereiten

Im Mux-Dashboard in der produktiven Umgebung anlegen:

- Access Token mit Video-Lese- und Video-Schreibrechten
- Signing Key für signierte Wiedergabe
- Webhook mit Ziel `https://www.swisscompact.com/api/dashboard/records?integration=mux-webhook`

Der Signing Key und das Webhook-Geheimnis werden nur einmal vollständig angezeigt. Direkt sicher in den Vercel-Umgebungsvariablen speichern, nicht in Git und nicht im Browser.

## 2. Vercel-Variablen setzen

In Production, Preview und bei Bedarf Development separat:

```text
MUX_VIDEO_ENABLED=true
MUX_TOKEN_ID=...
MUX_TOKEN_SECRET=...
MUX_WEBHOOK_SECRET=...
MUX_SIGNING_KEY_ID=...
MUX_PRIVATE_KEY=...
```

`MUX_PRIVATE_KEY` ist der von Mux ausgegebene Base64-Wert. Keine dieser Variablen darf mit `VITE_` beginnen.

## 3. Webhook-Ereignisse

Der Endpunkt prüft HMAC-SHA256-Signaturen und akzeptiert nur Ereignisse, die höchstens fünf Minuten alt sind. Verarbeitet werden insbesondere:

- `video.upload.asset_created`
- `video.asset.ready`
- `video.asset.static_rendition.created`
- `video.asset.static_rendition.ready`
- Fehler- und Timeout-Ereignisse derselben Ressourcen

Mux-Wiederholungen sind unkritisch: Statusaktualisierungen sind idempotent.

## 4. Funktionsprüfung

1. Kurzes MP4-Video hochladen.
2. Prüfen, dass nach dem Upload `VIDEO WIRD AUFBEREITET` erscheint.
3. Im Mux-Dashboard kontrollieren, dass Asset, signed Playback ID und `highest.mp4` erstellt wurden.
4. Prüfen, dass das Portal automatisch auf `DISPLAYBEREIT` wechselt.
5. Video freigeben, einer Kampagne und einem Testdisplay zuweisen.
6. Wiedergabe und Offline-Cache am Player prüfen.
7. Video archivieren und endgültig löschen; danach muss das Asset auch in Mux gelöscht sein.

## Sicherheit

- Upload-Adressen sind kurzlebig und werden nur für angemeldete, berechtigte Portalbenutzer erzeugt.
- Videos verwenden signed Playback IDs; öffentliche Mux-URLs werden nicht erstellt.
- Die Wiedergabe-URL enthält ein serverseitig erzeugtes, zeitlich begrenztes RS256-Token.
- Erst vollständig erzeugte MP4-Renditionen erreichen Kampagnen und Player.
- Webhook-Nachrichten ohne gültige Signatur werden abgewiesen.
