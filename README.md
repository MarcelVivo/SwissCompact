# SwissCompact Erlebniswelt

Produktionsprojekt für die scrollgesteuerte Erlebniswelt auf `swisscompact.com`.

## Technik

- Vite 8 und TypeScript
- zwölf scrollgesteuerte Stationen mit vorwärts und rückwärts laufenden Videos
- bedarfsgesteuertes Medien-Preloading mit Richtungs- und Verbindungspriorisierung
- adaptive H.264-Clips mit 1440 px für Desktop und 960 px für Mobilgeräte
- kurze Keyframe-Abstände für präzises Scroll-Scrubbing
- semantischer Reduced-Motion-Fallback

## Entwicklung

```bash
npm install
npm run dev
```

Die lokale Website läuft standardmässig unter der von Vite ausgegebenen Adresse.

## Prüfung und Build

```bash
npm run build
npm run test:browser
npm run test:showroom
npm run test:retail
```

Der Browser-Smoke-Test erwartet den Produktions-Preview unter
`http://127.0.0.1:4173`. Er fährt alle Videostationen vorwärts und rückwärts ab
und prüft HTTP-Status, Lazy Loading, Videodekodierung, Frame-Abstände,
Browserfehler und fehlgeschlagene Requests.

Der Showroom-Test prüft zusätzlich Themenwechsel, Dialogfokus und ARIA-Zustände
sowie die vertikale UI-Hierarchie auf Laptop, Tablet und Mobile. Eine abweichende
lokale Adresse kann über `SWISSCOMPACT_BASE_URL` gesetzt werden.

Der Retail-Test prüft die Räume Modegeschäft, Elektronikfachmarkt und
Einkaufszentrum inklusive individueller Architektur, Möbelauswahl,
Display-/Öffnungskollisionen und responsiver Raumnavigation. Die technische und
gestalterische Dokumentation liegt in
`docs/retail-shopping-showroom.md`.

Das statische Produktionspaket wird nach `dist/` geschrieben und kann ohne SSR auf einem Standard-Webhosting veröffentlicht werden.

## KI-Sales-Assistent

Ein Chat-Widget berät Website-Besucher, empfiehlt passende Leistungen und übergibt
qualifizierte Anfragen per E-Mail und CRM-Eintrag. Serverseitige Vercel-Functions unter
`api/assistant/`, Frontend-Modul `src/ui/salesAssistant.ts`. Details, Setup und
Environment-Variablen: `docs/sales-assistant.md`.

## Display-Inhaltseditor und Bild-KI

Die grosse Display-Vorschau enthält einen Inhaltseditor für Texte, Preise,
scanbare QR-Codes, eigene Bilder und Animationen. Die optionale serverseitige
Bild-KI-Schnittstelle ist in `docs/display-image-api.md` dokumentiert. Eine
Beispielkonfiguration liegt in `.env.example`.

## Medien optimieren

Die hochauflösenden Quellen liegen ausserhalb des öffentlichen Builds in
`media-source/`. Daraus erzeugt dieser Befehl die weboptimierten Dateien:

```bash
npm run optimize:videos
```

Die Produktionsclips werden nach `public/site/media/` geschrieben. Kleinere
Mobilvarianten liegen in `public/site/media/mobile/`. Die Originale bleiben
unverändert erhalten.
