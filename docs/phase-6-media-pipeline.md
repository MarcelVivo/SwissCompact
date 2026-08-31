# Phase 6 – sichere Medienannahme

## Umgesetzt

- Bilder und Videos werden vor dem Upload im Browser tatsächlich dekodiert.
- Beschädigte oder auf dem Gerät nicht lesbare Dateien werden vor dem Speichern abgewiesen.
- Auflösung, Seitenverhältnis und bei Videos die Laufzeit werden gespeichert und im Portal angezeigt.
- Für Videos wird automatisch ein separates JPEG-Vorschaubild erzeugt und privat im Mandantenordner gespeichert.
- Erst vollständig übertragene und geprüfte Medien erhalten den Zustand `display_ready`.
- Kampagnen, Ersatzinhalte und Player-Auslieferung akzeptieren keine unvollständigen Medien.
- Beim Abbruch oder endgültigen Löschen werden Mediendatei und Vorschaubild gemeinsam entfernt.

Die Metadaten liegen rückwärtskompatibel im bestehenden `payload` von `tenant_content`. Für diesen Schritt ist deshalb keine SQL-Migration notwendig.

## Bewusste Grenze

Die technische Vorprüfung ist keine serverseitige Transkodierung. Eine automatische Umwandlung fremder Codecs in ein einheitliches H.264/AAC-Auslieferungsformat benötigt einen separaten Medien-Worker oder einen spezialisierten Videodienst. Ungeeignete Dateien werden bis dahin sicher abgewiesen, statt ungeprüft an Displays ausgeliefert zu werden.

## Kontrolle

```bash
npm run test:portal-media
npm run build
```

Im Portal ein kurzes Video auswählen. Noch vor dem Upload müssen Auflösung, Laufzeit, Format und „Vorschau erstellt“ erscheinen. Nach dem Upload zeigt die Medienkarte `DISPLAYBEREIT` und das automatisch erzeugte Standbild.
