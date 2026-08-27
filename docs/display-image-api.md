# SwissCompact Display Image API

Der Inhalts-Konfigurator kann automatisch generierte Bilder über einen
serverseitigen Proxy beziehen. Der Browser erhält niemals den API-Schlüssel des
verwendeten Bildanbieters.

## Konfiguration

Beim Build wird der Endpoint über folgende Variable gesetzt:

```env
VITE_SWISSCOMPACT_IMAGE_API_URL=https://api.swisscompact.com/v1/display-images
```

Alternativ kann der Wert im Meta-Tag `swisscompact-image-api` in `index.html`
eingetragen werden. Die Umgebungsvariable hat Vorrang.

## Anfrage

```http
POST /v1/display-images
Content-Type: application/json
```

```json
{
  "prompt": "Ein saisonales Schweizer Restaurantmotiv, elegant und warm",
  "room": "restaurant",
  "role": "background",
  "orientation": "landscape"
}
```

- `room`: interner Raum-Presetname
- `role`: `background` oder `hero`
- `orientation`: `landscape` oder `portrait`

## Antwort

Die API kann eines der folgenden Felder liefern:

```json
{ "dataUrl": "data:image/webp;base64,..." }
```

```json
{ "imageBase64": "UklGR..." }
```

```json
{ "imageUrl": "https://cdn.swisscompact.com/generated/abc.webp" }
```

Bei `imageUrl` muss der Bildserver CORS für die Website erlauben. Das Frontend
lädt und optimiert das Bild vor dem Einsetzen. Empfohlen werden WebP-Dateien mit
maximal 1600 Pixeln an der längsten Kante.

## Sicherheitsanforderungen

- Schlüssel des KI-Anbieters ausschliesslich serverseitig speichern.
- Benutzer und Kontingente am Proxy authentifizieren und limitieren.
- Prompt und generiertes Bild moderieren.
- Nur HTTPS-URLs und freigegebene Bildtypen ausgeben.
- Zeitlimits, Kostenlimits und nachvollziehbare Request-IDs verwenden.

Ohne konfigurierten Endpoint bleibt die manuelle SwissCompact-Bildbestellung
voll funktionsfähig. Sie erzeugt eine Referenznummer und öffnet eine
vorbereitete E-Mail mit Raum, Verwendungsart und Bildbeschreibung.
